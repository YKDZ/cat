import type { OperationContext } from "@cat/domain";

import { getDbHandle } from "@cat/domain";
import {
  executeQuery,
  getSearchMemoryChunkRange,
  listMemorySuggestionsByChunkIds,
} from "@cat/domain";
import { MemorySuggestionSchema, type MemorySuggestion } from "@cat/shared";
import * as z from "zod";

import { searchChunkOp } from "./search-chunk";

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
 * @zh 搜索翻译记忆。
 *
 * 在指定记忆库中通过向量相似度搜索匹配的翻译记忆。
 * 支持通过 chunkIds（已存储嵌入）或 queryVectors（直传向量）两种查询模式。
 * @en Search translation memory.
 *
 * Searches for matching translation memory entries within the specified
 * memory banks via vector similarity. Supports two query modes:
 * lookups by chunkIds (pre-stored embeddings) or queryVectors (raw vectors).
 *
 * @param data - {@zh 记忆搜索输入参数} {@en Memory search input parameters}
 * @param ctx - {@zh 操作上下文} {@en Operation context}
 * @returns - {@zh 匹配的翻译记忆条目列表（按置信度降序排列）} {@en List of matching memory entries (sorted by confidence descending)}
 */
export const searchMemoryOp = async (
  data: SearchMemoryInput,
  ctx?: OperationContext,
): Promise<SearchMemoryOutput> => {
  const hasVectors = data.queryVectors && data.queryVectors.length > 0;
  if (!hasVectors && data.chunkIds.length === 0) {
    return { memories: [] };
  }

  const { client: drizzle } = await getDbHandle();

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
    data.sourceLanguageId,
    data.translationLanguageId,
    data.maxAmount,
  );

  return { memories };
};

const searchMemory = async (
  drizzle: Awaited<ReturnType<typeof getDbHandle>>["client"],
  chunks: { chunkId: number; similarity: number }[],
  memoryIds: string[],
  sourceLanguageId: string,
  translationLanguageId: string,
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
      sourceLanguageId,
      translationLanguageId,
    },
  );

  const result = rows
    .map((row) => ({
      ...row,
      confidence: searchResult.get(row.chunkId) ?? 0,
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt),
      evidences: [],
    }))
    .sort((a, b) => b.confidence - a.confidence);

  return result;
};
