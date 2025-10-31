import {
  eq,
  getDrizzleDB,
  inArray,
  sql,
  translatableElement,
  translatableString,
} from "@cat/db";
import { Queue, QueueEvents, Worker } from "bullmq";
import { PluginRegistry } from "@cat/plugin-core";
import {
  TranslatableElementDataSchema,
  type TranslatableElementData,
} from "@cat/shared/schema/misc";
import * as z from "zod/v4";
import { isEqual } from "lodash-es";
import { assertFirstNonNullish, chunk } from "@cat/shared/utils";
import {
  createStringFromData,
  diffArraysAndSeparate,
} from "@cat/app-server-shared/utils";
import { config } from "./config.ts";
import { registerTaskUpdateHandlers } from "@/utils/worker.ts";
import {
  DistributedTaskHandler,
  type ChunkData,
  type DistributedTask,
} from "@/utils/chunk.ts";

const { client: drizzle } = await getDrizzleDB();

const queueId = "batchDiffElements";

export const batchDiffElementsQueue = new Queue(queueId, config);
export const batchDiffElementsQueueEvents = new QueueEvents(queueId);

const worker = new Worker(
  queueId,
  async (job) => {
    const { newElementsData, oldElementIds, documentId } = z
      .object({
        newElementsData: z.array(
          TranslatableElementDataSchema.required({
            sortIndex: true,
          }),
        ),
        oldElementIds: z.array(z.int()),
        documentId: z.uuidv7(),
      })
      .parse(job.data);

    const pluginRegistry = PluginRegistry.get("GLOBAL", "");

    await batchDiff(pluginRegistry, oldElementIds, newElementsData, documentId);
  },
  {
    ...config,
  },
);

const batchDiff = async (
  pluginRegistry: PluginRegistry,
  oldElementIds: number[],
  newElementsData: (TranslatableElementData & { sortIndex: number })[],
  documentId: string,
) => {
  const oldElements = (
    await drizzle
      .select({
        id: translatableElement.id,
        value: translatableString.value,
        meta: translatableElement.meta,
        languageId: translatableString.languageId,
        sortIndex: translatableElement.sortIndex,
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
  }));

  const { added, removed: removedElements } = diffArraysAndSeparate(
    oldElements,
    newElementsData,
    // 值和元数据相等即视为相等
    (a, b) => a.value === b.value && isEqual(a.meta, b.meta),
  );

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

    // 创建快速查找映射 (value + languageId -> stringId)
    const stringMap = new Map<string, number>();
    for (const str of existingStrings) {
      const key = `${str.value}|${str.languageId}`;
      stringMap.set(key, str.id);
    }

    // 分类 added 元素
    for (const element of added) {
      const key = `${element.value}|${element.languageId}`;
      const existingStringId = stringMap.get(key);

      if (existingStringId !== undefined) {
        addedElementsWithExistingString.push({
          value: element.value,
          sortIndex: element.sortIndex,
          languageId: element.languageId,
          meta: element.meta,
          stringId: existingStringId,
        });
      } else {
        addedElementsWithoutExistingString.push({
          value: element.value,
          sortIndex: element.sortIndex,
          languageId: element.languageId,
          meta: element.meta,
        });
      }
    }
  }

  // 移除元素
  if (removedElements.length !== 0)
    await new DistributedTaskHandler("batchDiffElements_removeElements", {
      chunks: chunk(removedElements, 100).map(({ index, chunk }) => {
        return {
          chunkIndex: index,
          data: chunk,
        };
      }),
      run: async ({ data }) => {
        await handleRemovedElements(data.map(({ id }) => id));
      },
      rollback: async (_, data) => {
        const result = z.array(z.int()).parse(data);
        await rollbackRemovedElements(result);
      },
    }).run();

  // 添加不带 string 缓存的元素
  if (addedElementsWithoutExistingString.length !== 0) {
    type ChunkElement = {
      element: TranslatableElementData & { sortIndex: number };
    };
    await new DistributedTaskHandler<ChunkElement>(
      "batchDiffElements_addElementWithoutExistingString",
      {
        chunks: chunk<TranslatableElementData & { sortIndex: number }>(
          addedElementsWithoutExistingString,
          100,
        ).map(({ index, chunk }) => {
          return {
            chunkIndex: index,
            data: chunk.map((el) => ({
              element: el,
            })),
          } satisfies ChunkData<{
            element: TranslatableElementData & { sortIndex: number };
          }>;
        }),
        run: async ({ data }) => {
          const elementIds = await handleAddedElementsWithoutExistingString(
            data.map((element) => element.element),
            documentId,
          );
          return { elementIds };
        },
        rollback: async (_, data) => {
          const { elementIds } = z
            .object({
              elementIds: z.array(z.int()),
            })
            .parse(data);
          await rollbackAddedElementsWithoutExistingString(elementIds);
        },
      } satisfies DistributedTask<ChunkElement>,
    ).run();
  }

  // 添加带 string 缓存的元素
  if (addedElementsWithExistingString.length !== 0) {
    type ChunkElement = TranslatableElementData & {
      sortIndex: number;
      stringId: number;
    };
    await new DistributedTaskHandler<ChunkElement>(
      "batchDiffElements_addElementWithExistingString",
      {
        chunks: chunk<ChunkElement>(addedElementsWithExistingString, 100).map(
          ({ index, chunk }) => {
            return {
              chunkIndex: index,
              data: chunk,
            } satisfies ChunkData<ChunkElement>;
          },
        ),
        run: async ({ data }) => {
          const elementIds = await handleAddedElementsWithExistingString(
            data,
            documentId,
          );
          return { elementIds };
        },
        rollback: async (_, data) => {
          const { elementIds } = z
            .object({
              elementIds: z.array(z.int()),
            })
            .parse(data);
          await rollbackAddedElementsWithExistingString(elementIds);
        },
      } satisfies DistributedTask<ChunkElement>,
    ).run();
  }
};

const handleRemovedElements = async (elementIds: number[]): Promise<void> => {
  await drizzle
    .delete(translatableElement)
    .where(inArray(translatableElement.id, elementIds));
};

// oxlint-disable-next-line require-await
const rollbackRemovedElements = async (elementIds: number[]): Promise<void> => {
  // oxlint-disable-next-line restrict-template-expressions
  throw new Error(`Not implemented ${elementIds}`);
};

const handleAddedElementsWithoutExistingString = async (
  elements: (TranslatableElementData & { sortIndex: number })[],
  documentId: string,
): Promise<number[]> => {
  const pluginRegistry = PluginRegistry.get("GLOBAL", "");

  // TODO 配置
  const vectorStorage = assertFirstNonNullish(
    await pluginRegistry.getPluginServices(drizzle, "VECTOR_STORAGE"),
  );

  // TODO 配置
  const vectorizer = assertFirstNonNullish(
    await pluginRegistry.getPluginServices(drizzle, "TEXT_VECTORIZER"),
  );

  return drizzle.transaction(async (tx) => {
    const stringIds = await createStringFromData(
      tx,
      vectorizer.service,
      vectorizer.id,
      vectorStorage.service,
      vectorStorage.id,
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
};

const rollbackAddedElementsWithoutExistingString = async (
  elementIds: number[],
) => {
  await drizzle.transaction(async (tx) => {
    await tx
      .delete(translatableElement)
      .where(inArray(translatableElement.id, elementIds));
  });
};

const handleAddedElementsWithExistingString = async (
  elements: (TranslatableElementData & {
    sortIndex: number;
    stringId: number;
  })[],
  documentId: string,
): Promise<number[]> => {
  return (
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
};

const rollbackAddedElementsWithExistingString = async (
  elementIds: number[],
) => {
  await drizzle
    .delete(translatableElement)
    .where(inArray(translatableElement.id, elementIds));
};

registerTaskUpdateHandlers(drizzle, worker, queueId);
