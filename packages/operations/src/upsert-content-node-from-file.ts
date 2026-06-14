import type { OperationContext } from "@cat/domain";

import * as z from "zod";

import { diffStructuredContentOp } from "./diff-structured-content";
import { parseFileOp } from "./parse-file";

export const UpsertContentNodeFromFileInputSchema = z.object({
  projectId: z.uuidv4(),
  contentNodeId: z.uuidv4(),
  fileId: z.int(),
  languageId: z.string(),
  vectorizerId: z.int(),
  vectorStorageId: z.int(),
});

export const UpsertContentNodeFromFileOutputSchema = z.object({
  success: z.boolean(),
  contentNodeIds: z.array(z.uuidv4()),
  addedCount: z.int(),
  removedCount: z.int(),
  updatedCount: z.int(),
  movedCount: z.int(),
  semanticDiffIds: z.array(z.int()),
});

export type UpsertContentNodeFromFileInput = z.infer<
  typeof UpsertContentNodeFromFileInputSchema
>;
export type UpsertContentNodeFromFileOutput = z.infer<
  typeof UpsertContentNodeFromFileOutputSchema
>;

/**
 *
 * 1. 调用 parseFileOp 解析文件为结构化内容图载荷
 * 2. 调用 diffStructuredContentOp 执行差分并持久化
 *
 * Synchronize file content to translatable elements under a content node
 * via file parsing and stable-identity diff.
 *
 * @param data - Synchronization input parameters
 * @param ctx - Operation context
 * @returns - Sync result statistics
 */
export const upsertContentNodeFromFileOp = async (
  data: UpsertContentNodeFromFileInput,
  ctx?: OperationContext,
): Promise<UpsertContentNodeFromFileOutput> => {
  const { payload } = await parseFileOp(
    {
      projectId: data.projectId,
      fileId: data.fileId,
      languageId: data.languageId,
      contentNodeId: data.contentNodeId,
    },
    ctx,
  );

  const result = await diffStructuredContentOp(
    {
      payload,
      vectorizerId: data.vectorizerId,
      vectorStorageId: data.vectorStorageId,
    },
    ctx,
  );

  return {
    success: true,
    contentNodeIds: result.contentNodeIds,
    addedCount: result.addedElementIds.length,
    removedCount: result.removedElementIds.length,
    updatedCount: result.updatedElementIds.length,
    movedCount: result.movedElementIds.length,
    semanticDiffIds: result.semanticDiffIds,
  };
};
