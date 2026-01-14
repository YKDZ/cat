import { defineWorkflow } from "@/core";
import { searchMemory } from "@cat/app-server-shared/utils";
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
import { searchChunkWorkflow } from "./search-chunk.ts";

export const SearchMemoryInputSchema = z.object({
  minSimilarity: z.number().min(0).max(1),
  maxAmount: z.int().min(0),
  /**
   * 被查找是否存在记忆的原文本的 chunkIds
   */
  chunkIds: z.array(z.int()),
  memoryIds: z.array(z.uuidv4()),
  sourceLanguageId: z.string(),
  translationLanguageId: z.string(),
  vectorStorageId: z.int(),
});

export const SearchMemoryOutputSchema = z.object({
  memories: z.array(MemorySuggestionSchema),
});

export const searchMemoryWorkflow = await defineWorkflow({
  name: "memory.search",
  input: SearchMemoryInputSchema,
  output: SearchMemoryOutputSchema,

  dependencies: async (data, { traceId }) => {
    const { client: drizzle } = await getDrizzleDB();

    const sourceString = aliasedTable(translatableString, "sourceString");
    const translationString = aliasedTable(
      translatableString,
      "translationString",
    );

    // 指定记忆库中该语言对对应的所有条目的 chunk 的 id 的集合
    // 即为进行余弦相似度查找的 chunk 范围
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

    return [
      await searchChunkWorkflow.asChild(
        {
          minSimilarity: data.minSimilarity,
          maxAmount: data.maxAmount,
          searchRange,
          vectorStorageId: data.vectorStorageId,
        },
        { traceId },
      ),
    ];
  },

  handler: async (data, { getTaskResult }) => {
    const { client: drizzle } = await getDrizzleDB();

    const [searchChunkResult] = getTaskResult(searchChunkWorkflow);
    if (!searchChunkResult) {
      return { memories: [] };
    }

    const { chunks } = searchChunkResult;

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
  },
});
