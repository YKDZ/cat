import { PluginManager, type VectorStorage } from "@cat/plugin-core";
import * as z from "zod";

import type { OperationContext } from "@/operations/types";

import { retrieveEmbeddingsOp } from "@/operations/retrieve-embeddings";
import { getServiceFromDBId } from "@/utils";

export const SearchChunkInputSchema = z.object({
  minSimilarity: z.number().min(0).max(1),
  maxAmount: z.int().min(0),
  searchRange: z.array(z.int()),
  queryChunkIds: z
    .array(z.int())
    .default([])
    .meta({
      description:
        "IDs of pre-stored chunks whose embeddings are used as the search query. " +
        "Ignored when queryVectors is provided.",
    }),
  queryVectors: z
    .array(z.array(z.number()))
    .optional()
    .meta({
      description:
        "Raw embedding vectors to use as the search query. " +
        "When provided, queryChunkIds is ignored and no DB lookup is performed.",
    }),
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
 * 支持两种查询模式：
 * 1. 通过 queryChunkIds 从数据库检索已有嵌入向量
 * 2. 通过 queryVectors 直接传入原始向量（跳过 DB 查询）
 *
 * 然后在指定范围内进行余弦相似度搜索。
 */
export const searchChunkOp = async (
  payload: SearchChunkInput,
  ctx?: OperationContext,
): Promise<SearchChunkOutput> => {
  const pluginManager = PluginManager.get("GLOBAL", "");

  // 优先使用直接传入的向量，否则从数据库检索
  let vectors: number[][];
  if (payload.queryVectors && payload.queryVectors.length > 0) {
    vectors = payload.queryVectors;
  } else {
    const embeddingsResult = await retrieveEmbeddingsOp(
      { chunkIds: payload.queryChunkIds },
      ctx,
    );
    vectors = embeddingsResult.embeddings;
  }

  const { minSimilarity, maxAmount, vectorStorageId, searchRange } = payload;

  const vectorStorage = getServiceFromDBId<VectorStorage>(
    pluginManager,
    vectorStorageId,
  );

  const chunks = await vectorStorage.cosineSimilarity({
    vectors,
    chunkIdRange: searchRange,
    minSimilarity,
    maxAmount,
  });

  return { chunks };
};
