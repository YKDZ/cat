import {
  aliasedTable,
  and,
  chunk,
  eq,
  getDrizzleDB,
  inArray,
  memoryItem,
  translatableString,
} from "@cat/db";
import { MemorySuggestionSchema } from "@cat/shared/schema/misc";
import * as z from "zod";

import type { OperationContext } from "@/operations/types";

import { searchChunkOp } from "@/operations/search-chunk";
import { searchMemory } from "@/utils";

export const SearchMemoryInputSchema = z.object({
  minSimilarity: z.number().min(0).max(1).meta({
    description: "Minimum cosine similarity (0–1) required for a memory match.",
  }),
  maxAmount: z.int().min(0).meta({
    description: "Maximum number of memory matches to return.",
  }),
  chunkIds: z.array(z.int()).meta({
    description:
      "IDs of the source text chunks whose embeddings are used as the search query.",
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
  if (data.chunkIds.length === 0) {
    return { memories: [] };
  }

  const { client: drizzle } = await getDrizzleDB();

  const sourceString = aliasedTable(translatableString, "sourceString");
  const translationString = aliasedTable(
    translatableString,
    "translationString",
  );

  // 1. 计算搜索范围（原 dependencies 阶段）
  const sourceChunkIds = await drizzle
    .selectDistinct({ id: chunk.id })
    .from(memoryItem)
    .innerJoin(sourceString, eq(sourceString.id, memoryItem.sourceStringId))
    .innerJoin(
      translationString,
      eq(translationString.id, memoryItem.translationStringId),
    )
    .innerJoin(chunk, eq(chunk.chunkSetId, sourceString.chunkSetId))
    .where(
      and(
        inArray(memoryItem.memoryId, data.memoryIds),
        eq(sourceString.languageId, data.sourceLanguageId),
        eq(translationString.languageId, data.translationLanguageId),
      ),
    );

  const reversedChunkIds = await drizzle
    .selectDistinct({ id: chunk.id })
    .from(memoryItem)
    .innerJoin(sourceString, eq(sourceString.id, memoryItem.sourceStringId))
    .innerJoin(
      translationString,
      eq(translationString.id, memoryItem.translationStringId),
    )
    .innerJoin(chunk, eq(chunk.chunkSetId, translationString.chunkSetId))
    .where(
      and(
        inArray(memoryItem.memoryId, data.memoryIds),
        eq(translationString.languageId, data.sourceLanguageId),
        eq(sourceString.languageId, data.translationLanguageId),
      ),
    );

  const searchRange = Array.from(
    new Set([...sourceChunkIds, ...reversedChunkIds].map((row) => row.id)),
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
      vectorStorageId: data.vectorStorageId,
    },
    ctx,
  );

  const { chunks } = searchChunkResult;

  // 3. 处理结果（原 handler 阶段）
  const memories = await drizzle.transaction(async (tx) => {
    return await searchMemory(
      tx,
      chunks,
      data.sourceLanguageId,
      data.translationLanguageId,
      data.memoryIds,
    );
  });

  return { memories };
};
