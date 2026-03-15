import { getDrizzleDB } from "@cat/db";
import {
  executeQuery,
  getSearchMemoryChunkRange,
  listMemorySuggestionsByChunkIds,
} from "@cat/domain";
import {
  MemorySuggestionSchema,
  type MemorySuggestion,
} from "@cat/shared/schema/misc";
import * as z from "zod";

import type { OperationContext } from "@/operations/types";

import { searchChunkOp } from "@/operations/search-chunk";

export const SearchMemoryInputSchema = z.object({
  minSimilarity: z.number().min(0).max(1).meta({
    description: "Minimum cosine similarity (0–1) required for a memory match.",
  }),
  maxAmount: z.int().min(0).meta({
    description: "Maximum number of memory matches to return.",
  }),
  chunkIds: z
    .array(z.int())
    .default([])
    .meta({
      description:
        "IDs of the source text chunks whose embeddings are used as the search query. " +
        "Ignored when queryVectors is provided.",
    }),
  queryVectors: z
    .array(z.array(z.number()))
    .optional()
    .meta({
      description:
        "Raw embedding vectors to use as the search query. " +
        "When provided, chunkIds is ignored and no DB lookup is performed.",
    }),
  memoryIds: z.array(z.uuidv4()).meta({
    description: "UUIDs of the translation memory banks to search in.",
  }),
  sourceLanguageId: z.string(),
  translationLanguageId: z.string(),
  vectorStorageId: z.int().meta({
    description: "Plugin service ID of the vector storage backend to query.",
  }),
});

export const SearchMemoryOutputSchema = z.object({
  memories: z.array(MemorySuggestionSchema),
});

export type SearchMemoryInput = z.infer<typeof SearchMemoryInputSchema>;
export type SearchMemoryOutput = z.infer<typeof SearchMemoryOutputSchema>;

/**
 * 搜索翻译记忆
 *
 * 在指定记忆库中通过向量相似度搜索匹配的翻译记忆。
 * 合并了原 workflow 的 dependencies（计算搜索范围）和 handler（处理结果）。
 */
export const searchMemoryOp = async (
  data: SearchMemoryInput,
  ctx?: OperationContext,
): Promise<SearchMemoryOutput> => {
  const hasVectors = data.queryVectors && data.queryVectors.length > 0;
  if (!hasVectors && data.chunkIds.length === 0) {
    return { memories: [] };
  }

  const { client: drizzle } = await getDrizzleDB();

  // 1. 计算搜索范围（原 dependencies 阶段）
  const searchRange = await executeQuery(
    { db: drizzle },
    getSearchMemoryChunkRange,
    {
      memoryIds: data.memoryIds,
      sourceLanguageId: data.sourceLanguageId,
      translationLanguageId: data.translationLanguageId,
    },
  );

  if (searchRange.length === 0) {
    return { memories: [] };
  }

  // 2. 调用 searchChunkOp
  const searchChunkResult = await searchChunkOp(
    {
      minSimilarity: data.minSimilarity,
      maxAmount: data.maxAmount,
      searchRange,
      queryChunkIds: data.chunkIds,
      ...(hasVectors ? { queryVectors: data.queryVectors } : {}),
      vectorStorageId: data.vectorStorageId,
    },
    ctx,
  );

  const { chunks } = searchChunkResult;

  // 3. 处理结果（原 handler 阶段）
  const memories = await searchMemory(
    drizzle,
    chunks,
    data.memoryIds,
    data.maxAmount,
  );

  return { memories };
};

const searchMemory = async (
  drizzle: Awaited<ReturnType<typeof getDrizzleDB>>["client"],
  chunks: { chunkId: number; similarity: number }[],
  memoryIds: string[],
  maxAmount: number = 3,
): Promise<MemorySuggestion[]> => {
  const searchResult = new Map(chunks.map((it) => [it.chunkId, it.similarity]));
  const searchedChunkIds = Array.from(searchResult.keys());

  if (searchedChunkIds.length === 0) return [];

  const rows = await executeQuery(
    { db: drizzle },
    listMemorySuggestionsByChunkIds,
    {
      searchedChunkIds,
      memoryIds,
      maxAmount,
    },
  );

  const result = rows
    .map((row) => ({
      ...row,
      confidence: searchResult.get(row.chunkId) ?? 0,
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt),
    }))
    .sort((a, b) => b.confidence - a.confidence);

  return result;
};
