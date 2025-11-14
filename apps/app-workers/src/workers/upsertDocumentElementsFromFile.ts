import {
  and,
  blob,
  document,
  type DrizzleClient,
  eq,
  file,
  getDrizzleDB,
  translatableElement,
} from "@cat/db";
import * as z from "zod/v4";
import {
  PluginRegistry,
  type StorageProvider,
  type TranslatableFileHandler,
} from "@cat/plugin-core";
import {
  getServiceFromDBId,
  readableToBuffer,
} from "@cat/app-server-shared/utils";
import { assertSingleNonNullish, logger } from "@cat/shared/utils";
import type { TranslatableElementDataWithoutLanguageId } from "@cat/shared/schema/misc";
import { defineFlow, defineWorker } from "@/utils";
import batchDiffElements from "./batchDiffElements.ts";

const { client: drizzle } = await getDrizzleDB();

const flowId = "upsert-document-elements-from-file";
const finalizeWorkerId = "upsert-document-elements-finalize";
const name = "Upsert Document Elements From File";

const UpsertDocumentElementsInputSchema = z.object({
  documentId: z.uuidv7(),
  fileId: z.int(),
  languageId: z.string(),
});

type UpsertDocumentElementsInput = z.infer<
  typeof UpsertDocumentElementsInputSchema
>;

const FinalizeInputSchema = z.object({
  documentId: z.uuidv7(),
  fileId: z.int(),
  languageId: z.string(),
});

type UpsertDocumentElementsFinalizeInput = z.infer<typeof FinalizeInputSchema>;

declare module "../core/registry" {
  interface WorkerInputTypeMap {
    [finalizeWorkerId]: UpsertDocumentElementsFinalizeInput;
  }

  interface FlowInputTypeMap {
    [flowId]: UpsertDocumentElementsInput;
  }
}

/**
 * 从文件中提取元素
 */
async function extractElementsFromFile(
  drizzle: DrizzleClient,
  pluginRegistry: PluginRegistry,
  handler: TranslatableFileHandler,
  fileId: number,
) {
  const { key, storageProviderId } = assertSingleNonNullish(
    await drizzle
      .select({
        key: blob.key,
        storageProviderId: blob.storageProviderId,
      })
      .from(file)
      .innerJoin(blob, eq(blob.id, file.blobId))
      .where(and(eq(file.id, fileId), eq(file.isActive, true))),
    `File ${fileId} not found`,
  );

  const provider = await getServiceFromDBId<StorageProvider>(
    drizzle,
    pluginRegistry,
    storageProviderId,
  );

  const fileContent = await readableToBuffer(await provider.getStream(key));

  const newElements = sortAndAssignIndex(
    await handler.extractElement(fileContent),
  );

  return newElements;
}

/**
 * 排序并分配索引
 */
function sortAndAssignIndex(
  elements: TranslatableElementDataWithoutLanguageId[],
): (TranslatableElementDataWithoutLanguageId & { sortIndex: number })[] {
  const withSortIndex: (TranslatableElementDataWithoutLanguageId & {
    sortIndex: number;
  })[] = [];
  const withoutSortIndex: {
    item: TranslatableElementDataWithoutLanguageId;
    originalIndex: number;
  }[] = [];

  elements.forEach((item, idx) => {
    if (typeof item.sortIndex === "number") {
      withSortIndex.push({
        ...item,
        sortIndex: item.sortIndex,
      });
    } else {
      withoutSortIndex.push({ item, originalIndex: idx });
    }
  });

  withSortIndex.sort((a, b) => a.sortIndex - b.sortIndex);

  const maxSortIndex =
    withSortIndex.length > 0
      ? Math.max(...withSortIndex.map((i) => i.sortIndex))
      : -1;

  let currentIndex = maxSortIndex;
  const assignedWithoutSortIndex = withoutSortIndex
    .sort((a, b) => a.originalIndex - b.originalIndex)
    .map(({ item }) => ({
      ...item,
      sortIndex: (currentIndex += 1),
    }));

  return [...withSortIndex, ...assignedWithoutSortIndex];
}

/**
 * 准备文档更新上下文
 */
async function prepareUpsertContext(input: UpsertDocumentElementsInput) {
  const { documentId, fileId, languageId } = input;

  const pluginRegistry = PluginRegistry.get("GLOBAL", "");

  // 获取文档和文件处理器
  const dbDocument = assertSingleNonNullish(
    await drizzle
      .select({
        fileHandlerId: document.fileHandlerId,
      })
      .from(document)
      .where(eq(document.id, documentId)),
    `Document ${documentId} not exists`,
  );

  if (!dbDocument.fileHandlerId) {
    throw new Error(`Document ${documentId} is not file based`);
  }

  // 获取文件信息
  const dbFile = assertSingleNonNullish(
    await drizzle
      .select({
        id: file.id,
      })
      .from(file)
      .where(eq(file.id, fileId)),
    `File ${fileId} not exists`,
  );

  const handler = await getServiceFromDBId<TranslatableFileHandler>(
    drizzle,
    pluginRegistry,
    dbDocument.fileHandlerId,
  );

  // 提取新元素
  const newElementsData = (
    await extractElementsFromFile(drizzle, pluginRegistry, handler, dbFile.id)
  ).map((el) => ({ ...el, languageId }));

  // 获取旧元素 IDs
  const oldElementIds = (
    await drizzle
      .select({
        id: translatableElement.id,
      })
      .from(translatableElement)
      .where(eq(translatableElement.documentId, documentId))
  ).map((el) => el.id);

  return {
    newElementsData,
    oldElementIds,
    documentId,
  };
}

const upsertDocumentElementsFinalizeWorker = defineWorker({
  id: finalizeWorkerId,
  inputSchema: FinalizeInputSchema,

  async execute(ctx) {
    const childrenValues = await ctx.job.getChildrenValues();

    let totalDeleted = 0;
    let totalCreated = 0;
    let chunksProcessed = 0;

    const parsed = z
      .object({
        totalDeleted: z.number().min(0).default(0),
        totalCreated: z.number().min(0).default(0),
        chunksProcessed: z.number().min(0).default(0),
      })
      .parse(Object.values(childrenValues)[0]);

    totalDeleted = parsed.totalDeleted;
    totalCreated = parsed.totalCreated;
    chunksProcessed = parsed.chunksProcessed;

    logger.info("PROCESSOR", {
      msg: "Document elements updated from file",
      documentId: ctx.input.documentId,
      fileId: ctx.input.fileId,
      languageId: ctx.input.languageId,
      totalDeleted,
      totalCreated,
      chunksProcessed,
    });

    return {
      documentId: ctx.input.documentId,
      fileId: ctx.input.fileId,
      languageId: ctx.input.languageId,
      totalDeleted,
      totalCreated,
      chunksProcessed,
    };
  },
});

const upsertDocumentElementsFromFileFlow = defineFlow({
  id: flowId,
  name,
  inputSchema: UpsertDocumentElementsInputSchema,

  async build(input) {
    // 准备数据
    const { newElementsData, oldElementIds, documentId } =
      await prepareUpsertContext(input);

    // 构建 batchDiffElements flow 的树结构
    const batchDiffTree =
      await batchDiffElements.flows.batchDiffElementsFlow.build({
        newElementsData,
        oldElementIds,
        documentId,
      });

    // 返回一个新的根节点，将 batchDiffElements 作为子节点
    return {
      name: "finalize",
      workerId: finalizeWorkerId,
      data: {
        documentId: input.documentId,
        fileId: input.fileId,
        languageId: input.languageId,
      },
      children: [
        {
          ...batchDiffTree,
          name: "batch-diff-elements",
        },
      ],
    };
  },
});

export default {
  workers: { upsertDocumentElementsFinalizeWorker },
  flows: { upsertDocumentElementsFromFileFlow },
} as const;
