import type { OperationContext } from "@cat/domain";

import { getDbHandle } from "@cat/domain";
import { executeQuery, listElementIdsByDocument } from "@cat/domain";
import * as z from "zod";

import { diffElementsOp } from "./diff-elements";
import { parseFileOp } from "./parse-file";

export const UpsertDocumentInputSchema = z.object({
  documentId: z.uuidv4(),
  fileId: z.int(),
  languageId: z.string(),
  vectorizerId: z.int(),
  vectorStorageId: z.int(),
});

export const UpsertDocumentOutputSchema = z.object({
  success: z.boolean(),
  addedCount: z.int(),
  removedCount: z.int(),
});

export type UpsertDocumentInput = z.infer<typeof UpsertDocumentInputSchema>;
export type UpsertDocumentOutput = z.infer<typeof UpsertDocumentOutputSchema>;

/**
 * @zh 从文件更新文档元素。
 *
 * 1. 解析文件获取元素列表
 * 2. 获取文档当前的旧元素
 * 3. 比较新旧元素并执行增删改
 * @en Update document elements from a file.
 *
 * 1. Parse the file to obtain an element list
 * 2. Fetch the current (old) element IDs for the document
 * 3. Diff the new and old elements and apply additions, deletions, and updates
 *
 * @param data - {@zh 文件更新输入参数} {@en File-from-document update input parameters}
 * @param ctx - {@zh 操作上下文} {@en Operation context}
 * @returns - {@zh 操作结果，包含新增和删除的元素数量} {@en Result containing the count of added and removed elements}
 */
export const upsertDocumentFromFileOp = async (
  data: UpsertDocumentInput,
  ctx?: OperationContext,
): Promise<UpsertDocumentOutput> => {
  const { client: drizzle } = await getDbHandle();

  // 1. 解析文件（原 dependencies 阶段）
  const parseResult = await parseFileOp(
    {
      fileId: data.fileId,
      languageId: data.languageId,
    },
    ctx,
  );

  // 2. 获取当前文档的旧元素 ID
  const oldElementIds = await executeQuery(
    { db: drizzle },
    listElementIdsByDocument,
    { documentId: data.documentId },
  );

  // 3. 比较新旧元素
  const diffStats = await diffElementsOp(
    {
      documentId: data.documentId,
      elementData: parseResult.elements,
      oldElementIds,
      vectorizerId: data.vectorizerId,
      vectorStorageId: data.vectorStorageId,
    },
    ctx,
  );

  return {
    success: true,
    addedCount: diffStats.addedElementIds.length,
    removedCount: diffStats.removedElementIds.length,
  };
};
