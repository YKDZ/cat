import { PluginManager, type VectorStorage } from "@cat/plugin-core";
import * as z from "zod";

import type { OperationContext } from "@/operations/types";

import { retrieveEmbeddingsOp } from "@/operations/retrieve-embeddings";
import { getServiceFromDBId } from "@/utils";

export const SearchChunkInputSchema = z.object({
  minSimilarity: z.number().min(0).max(1),
  maxAmount: z.int().min(0),
  searchRange: z.array(z.int()),
  queryChunkIds: z.array(z.int()),
  vectorStorageId: z.int(),
});

export const SearchChunkOutputSchema = z.object({
  chunks: z.array(
    z.object({
      chunkId: z.int(),
      similarity: z.number().min(0).max(1),
    }),
  ),
});

export type SearchChunkInput = z.infer<typeof SearchChunkInputSchema>;
export type SearchChunkOutput = z.infer<typeof SearchChunkOutputSchema>;

/**
 * 向量 chunk 搜索
 *
 * 先获取查询 chunk 的嵌入向量，然后在指定范围内进行余弦相似度搜索。
 */
export const searchChunkOp = async (
  payload: SearchChunkInput,
  ctx?: OperationContext,
): Promise<SearchChunkOutput> => {
  const pluginManager = PluginManager.get("GLOBAL", "");

  // 直接调用 retrieveEmbeddingsOp 获取嵌入向量
  const embeddingsResult = await retrieveEmbeddingsOp(
    { chunkIds: payload.queryChunkIds },
    ctx,
  );

  const { minSimilarity, maxAmount, vectorStorageId, searchRange } = payload;

  const vectorStorage = getServiceFromDBId<VectorStorage>(
    pluginManager,
    vectorStorageId,
  );

  const chunks = await vectorStorage.cosineSimilarity({
    vectors: embeddingsResult.embeddings,
    chunkIdRange: searchRange,
    minSimilarity,
    maxAmount,
  });

  return { chunks };
};
