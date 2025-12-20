import {
  eq,
  getDrizzleDB,
  inArray,
  sql,
  translatableElement,
  translatableString,
} from "@cat/db";
import { PluginRegistry } from "@cat/plugin-core";
import {
  TranslatableElementDataSchema,
  type TranslatableElementData,
} from "@cat/shared/schema/misc";
import * as z from "zod/v4";
import { isEqual } from "lodash-es";
import { assertFirstNonNullish, chunk, logger } from "@cat/shared/utils";
import {
  createStringFromData,
  diffArraysAndSeparate,
} from "@cat/app-server-shared/utils";
import { defineWorker, defineFlow } from "@/utils";
import type { FlowNode } from "@/core";

const { client: drizzle } = await getDrizzleDB();

const flowId = "batch-diff-element";
const finalizeWorkerId = "batch-diff-elements-finalize";
const name = "Batch Diff Element";

const BatchDiffElementsInputSchema = z.object({
  newElementsData: z.array(
    TranslatableElementDataSchema.required({
      sortIndex: true,
    }),
  ),
  oldElementIds: z.array(z.int()),
  documentId: z.uuidv7(),
});

type BatchDiffElementsInput = z.infer<typeof BatchDiffElementsInputSchema>;

type RemoveChunkInput = z.infer<typeof RemoveChunkInputSchema>;
type AddWithoutStringChunkInput = z.infer<
  typeof AddWithoutStringChunkInputSchema
>;
type AddWithStringChunkInput = z.infer<typeof AddWithStringChunkInputSchema>;

const RemoveChunkInputSchema = z.object({
  elementIds: z.array(z.int()),
  rollbackData: z.array(
    z.object({
      id: z.int(),
      translatableStringId: z.int(),
      sortIndex: z.int(),
      meta: z.json(),
      documentId: z.uuidv7(),
    }),
  ),
});

const AddWithoutStringChunkInputSchema = z.object({
  elements: z.array(
    TranslatableElementDataSchema.required({
      sortIndex: true,
    }),
  ),
  documentId: z.uuidv7(),
});

const AddWithStringChunkInputSchema = z.object({
  elements: z.array(
    TranslatableElementDataSchema.required({
      sortIndex: true,
    }).extend({
      stringId: z.int(),
    }),
  ),
  documentId: z.uuidv7(),
});

async function analyzeElementsDiff(input: BatchDiffElementsInput) {
  const { newElementsData, oldElementIds, documentId } = input;

  const oldElements = (
    await drizzle
      .select({
        id: translatableElement.id,
        value: translatableString.value,
        meta: translatableElement.meta,
        languageId: translatableString.languageId,
        sortIndex: translatableElement.sortIndex,
        translatableStringId: translatableElement.translatableStringId,
      })
      .from(translatableElement)
      .innerJoin(
        translatableString,
        eq(translatableElement.translatableStringId, translatableString.id),
      )
      .where(inArray(translatableElement.id, oldElementIds))
  ).map((element) => ({
    id: element.id,
    value: element.value,
    sortIndex: element.sortIndex,
    languageId: element.languageId,
    meta: element.meta,
    translatableStringId: element.translatableStringId,
    documentId: documentId,
  }));

  // 2. 计算差异
  const { added, removed: removedElements } = diffArraysAndSeparate(
    oldElements,
    newElementsData,
    (a, b) => a.value === b.value && isEqual(a.meta, b.meta),
  );

  // 3. 分类添加的元素（有无 string 缓存）
  const addedElementsWithoutExistingString: (TranslatableElementData & {
    sortIndex: number;
  })[] = [];
  const addedElementsWithExistingString: (TranslatableElementData & {
    sortIndex: number;
    stringId: number;
  })[] = [];

  if (added.length > 0) {
    const tuples = added.map((el) => sql`(${el.value}, ${el.languageId})`);

    const existingStrings = await drizzle
      .select({
        id: translatableString.id,
        value: translatableString.value,
        languageId: translatableString.languageId,
      })
      .from(translatableString)
      .where(
        sql`(${translatableString.value}, ${translatableString.languageId}) in (${sql.join(tuples, sql`, `)})`,
      );

    const stringMap = new Map<string, number>();
    for (const str of existingStrings) {
      const key = `${str.value}|${str.languageId}`;
      stringMap.set(key, str.id);
    }

    for (const element of added) {
      const key = `${element.value}|${element.languageId}`;
      const existingStringId = stringMap.get(key);

      if (existingStringId !== undefined) {
        addedElementsWithExistingString.push({
          ...element,
          stringId: existingStringId,
        });
      } else {
        addedElementsWithoutExistingString.push(element);
      }
    }
  }

  return {
    removedElements: removedElements.map((el) => ({
      id: el.id,
      translatableStringId: el.translatableStringId,
      sortIndex: el.sortIndex,
      meta: el.meta,
      documentId: el.documentId,
    })),
    addedElementsWithoutExistingString,
    addedElementsWithExistingString,
    documentId,
  };
}

async function executeRemoveElementsChunk(
  input: RemoveChunkInput,
): Promise<{ deletedCount: number; elementIds: number[] }> {
  const { elementIds } = input;

  if (elementIds.length === 0) {
    return {
      deletedCount: 0,
      elementIds: [],
    };
  }

  await drizzle
    .delete(translatableElement)
    .where(inArray(translatableElement.id, elementIds));

  return {
    deletedCount: elementIds.length,
    elementIds,
  };
}

const executeAddElementsWithoutStringChunk = async (
  input: AddWithoutStringChunkInput,
  pluginRegistry: PluginRegistry,
): Promise<{ createdCount: number; elementIds: number[] }> => {
  const { elements, documentId } = input;

  if (elements.length === 0) {
    return {
      createdCount: 0,
      elementIds: [],
    };
  }

  const vectorStorage = assertFirstNonNullish(
    pluginRegistry.getPluginServices("VECTOR_STORAGE"),
  );
  const vectorStorageId = await pluginRegistry.getPluginServiceDbId(
    drizzle,
    vectorStorage.record,
  );

  const vectorizer = assertFirstNonNullish(
    pluginRegistry.getPluginServices("TEXT_VECTORIZER"),
  );
  const vectorizerId = await pluginRegistry.getPluginServiceDbId(
    drizzle,
    vectorizer.record,
  );

  const elementIds = await drizzle.transaction(async (tx) => {
    const stringIds = await createStringFromData(
      tx,
      vectorizer.service,
      vectorizerId,
      vectorStorage.service,
      vectorStorageId,
      elements.map((data) => ({
        value: data.value,
        languageId: data.languageId,
      })),
    );

    return (
      await tx
        .insert(translatableElement)
        .values(
          elements.map((data, index) => ({
            sortIndex: data.sortIndex,
            meta: data.meta,
            documentId,
            translatableStringId: stringIds[index],
          })),
        )
        .returning({
          id: translatableElement.id,
        })
    ).map(({ id }) => id);
  });

  return {
    createdCount: elementIds.length,
    elementIds,
  };
};

async function executeAddElementsWithStringChunk(
  input: AddWithStringChunkInput,
): Promise<{ createdCount: number; elementIds: number[] }> {
  const { elements, documentId } = input;

  if (elements.length === 0) {
    return {
      createdCount: 0,
      elementIds: [],
    };
  }

  const elementIds = (
    await drizzle
      .insert(translatableElement)
      .values(
        elements.map((element) => ({
          sortIndex: element.sortIndex,
          meta: element.meta,
          documentId,
          translatableStringId: element.stringId,
        })),
      )
      .returning({
        id: translatableElement.id,
      })
  ).map(({ id }) => id);

  return {
    createdCount: elementIds.length,
    elementIds,
  };
}

/**
 * 删除元素
 */
const removeElementsChunkWorker = defineWorker({
  id: "remove-elements-chunk",
  inputSchema: RemoveChunkInputSchema,

  async execute(ctx) {
    return executeRemoveElementsChunk(ctx.input);
  },

  hooks: {
    onFailed: async (job, error) => {
      // 失败时自动回滚
      const { rollbackData } = RemoveChunkInputSchema.parse(job.data);

      logger.info("PROCESSOR", {
        msg: "Rolling back removed elements after failure",
        jobName: job.name,
        rollbackCount: rollbackData.length,
      });

      // 恢复被删除的元素
      if (rollbackData.length > 0) {
        await drizzle.insert(translatableElement).values(rollbackData);
      }

      logger.error(
        "PROCESSOR",
        {
          msg: "Rollback completed",
          jobName: job.name,
        },
        error,
      );
    },
  },
});

/**
 * 无 string 缓存的添加元素
 */
const addElementsWithoutStringChunkWorker = defineWorker({
  id: "add-elements-without-string-chunk",
  inputSchema: AddWithoutStringChunkInputSchema,

  async execute({ input, pluginRegistry }) {
    return executeAddElementsWithoutStringChunk(input, pluginRegistry);
  },

  hooks: {
    onFailed: async (job, error) => {
      logger.error(
        "PROCESSOR",
        {
          msg: "Failed to add elements without string, attempting rollback",
          jobName: job.name,
        },
        error,
      );

      // 尝试清理已创建的元素（如果有返回值）
      const result = z
        .object({
          elementIds: z.array(z.number()).nullish(),
        })
        .nullish()
        .parse(job.returnvalue);
      if (result && result.elementIds && Array.isArray(result.elementIds)) {
        await drizzle
          .delete(translatableElement)
          .where(inArray(translatableElement.id, result.elementIds));

        logger.info("PROCESSOR", {
          msg: "Rolled back elements",
          jobName: job.name,
          count: result.elementIds.length,
        });
      }
    },
  },
});

/**
 * 有 string 缓存的添加元素
 */
const addElementsWithStringChunkWorker = defineWorker({
  id: "add-elements-with-string-chunk",
  inputSchema: AddWithStringChunkInputSchema,

  async execute(ctx) {
    return executeAddElementsWithStringChunk(ctx.input);
  },

  hooks: {
    onFailed: async (job, error) => {
      logger.error(
        "PROCESSOR",
        {
          msg: "Failed to add elements with string, attempting rollback",
          jobName: job.name,
        },
        error,
      );

      const result = z
        .object({
          elementIds: z.array(z.number()).nullish(),
        })
        .nullish()
        .parse(job.returnvalue);
      if (result && result.elementIds && Array.isArray(result.elementIds)) {
        await drizzle
          .delete(translatableElement)
          .where(inArray(translatableElement.id, result.elementIds));

        logger.info("PROCESSOR", {
          msg: "Rolled back elements",
          jobName: job.name,
          count: result.elementIds.length,
        });
      }
    },
  },
});

const FinalizeInputSchema = z.object({
  documentId: z.uuidv7(),
  totalRemoved: z.number(),
  totalAddedWithoutString: z.number(),
  totalAddedWithString: z.number(),
});

type BatchDiffElementsFinalizeInput = z.infer<typeof FinalizeInputSchema>;

declare module "../core/registry" {
  interface WorkerInputTypeMap {
    "remove-elements-chunk": RemoveChunkInput;
    "add-elements-without-string-chunk": AddWithoutStringChunkInput;
    "add-elements-with-string-chunk": AddWithStringChunkInput;
    [finalizeWorkerId]: BatchDiffElementsFinalizeInput;
  }

  interface FlowInputTypeMap {
    [flowId]: BatchDiffElementsInput;
  }
}

declare module "../core/registry" {
  interface WorkerInputTypeMap {
    [finalizeWorkerId]: BatchDiffElementsFinalizeInput;
  }
}

const batchDiffElementsFinalizeWorker = defineWorker({
  id: finalizeWorkerId,
  inputSchema: FinalizeInputSchema,

  async execute(ctx) {
    const childrenValues = await ctx.job.getChildrenValues();

    // 汇总所有子任务的结果
    let totalDeleted = 0;
    let totalCreated = 0;

    for (const [_, r] of Object.entries(childrenValues)) {
      const result = z
        .object({
          deletedCount: z.int().optional(),
          createdCount: z.int().optional(),
        })
        .parse(r);
      if (result && typeof result === "object") {
        if ("deletedCount" in result && result.deletedCount) {
          totalDeleted += result.deletedCount;
        }
        if ("createdCount" in result && result.createdCount) {
          totalCreated += result.createdCount;
        }
      }
    }

    return {
      documentId: ctx.input.documentId,
      totalDeleted,
      totalCreated,
      chunksProcessed: Object.keys(childrenValues).length,
    };
  },
});

const batchDiffElementsFlow = defineFlow({
  id: flowId,
  name,
  inputSchema: BatchDiffElementsInputSchema,

  async build({ input }) {
    // 分析差异
    const {
      removedElements,
      addedElementsWithoutExistingString,
      addedElementsWithExistingString,
      documentId,
    } = await analyzeElementsDiff(input);

    const children: FlowNode[] = [];

    // 创建删除分块子任务
    const removeChunks = chunk(removedElements, 100);
    for (const { index, chunk: chunkData } of removeChunks) {
      children.push({
        name: `remove-chunk-${index}`,
        workerId: "remove-elements-chunk",
        data: {
          elementIds: chunkData.map((el) => el.id),
          rollbackData: chunkData,
        },
      });
    }

    // 无 string 缓存
    const addWithoutStringChunks = chunk(
      addedElementsWithoutExistingString,
      100,
    );
    for (const { index, chunk: chunkData } of addWithoutStringChunks) {
      children.push({
        name: `add-without-string-chunk-${index}`,
        workerId: "add-elements-without-string-chunk",
        data: {
          elements: chunkData,
          documentId,
        },
      });
    }

    // 有 string 缓存
    const addWithStringChunks = chunk(addedElementsWithExistingString, 100);
    for (const { index, chunk: chunkData } of addWithStringChunks) {
      children.push({
        name: `add-with-string-chunk-${index}`,
        workerId: "add-elements-with-string-chunk",
        data: {
          elements: chunkData,
          documentId,
        },
      });
    }

    // 返回父子结构
    return {
      name: "finalize",
      workerId: finalizeWorkerId,
      data: {
        documentId,
        totalRemoved: removedElements.length,
        totalAddedWithoutString: addedElementsWithoutExistingString.length,
        totalAddedWithString: addedElementsWithExistingString.length,
      },
      children,
    };
  },
});

export default {
  workers: {
    batchDiffElementsFinalizeWorker,
    removeElementsChunkWorker,
    addElementsWithoutStringChunkWorker,
    addElementsWithStringChunkWorker,
  },
  flows: { batchDiffElementsFlow },
} as const;
