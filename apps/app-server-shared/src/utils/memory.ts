import {
  aliasedTable,
  and,
  chunk,
  eq,
  inArray,
  memoryItem,
  OverallDrizzleClient,
  translatableString,
  union,
} from "@cat/db";
import { VectorStorage } from "@cat/plugin-core";
import { MemorySuggestion } from "@cat/shared/schema/misc";

export const searchMemory = async (
  drizzle: OverallDrizzleClient,
  vectorStorage: VectorStorage,
  embeddings: number[][],
  sourceLanguageId: string,
  translationLanguageId: string,
  memoryIds: string[],
  minSimilarity: number = 0.8,
  maxAmount: number = 3,
): Promise<MemorySuggestion[]> => {
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
        inArray(memoryItem.memoryId, memoryIds),
        eq(sourceString.languageId, sourceLanguageId),
        eq(translationString.languageId, translationLanguageId),
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
        inArray(memoryItem.memoryId, memoryIds),
        eq(translationString.languageId, sourceLanguageId),
        eq(sourceString.languageId, translationLanguageId),
      ),
    );

  const chunkIdRange = Array.from(
    new Set([...sourceChunkIds, ...reversedChunkIds].map((row) => row.id)),
  );

  const vectorItems = await vectorStorage.cosineSimilarity(
    embeddings,
    chunkIdRange,
    minSimilarity,
    maxAmount,
  );

  const searchResult = new Map(
    vectorItems.map((it) => [it.chunkId, it.similarity]),
  );
  const searchedChunkIds = Array.from(searchResult.keys());

  if (searchedChunkIds.length === 0) return [];

  const targetSetsQuery = drizzle
    .selectDistinct({ chunkSetId: chunk.chunkSetId })
    .from(chunk)
    .where(inArray(chunk.id, searchedChunkIds))
    .as("target_sets");

  const sourceItemsQuery = drizzle
    .select({
      id: memoryItem.id,
      source: sourceString.value,
      translation: translationString.value,
      sourceChunkSetId: sourceString.chunkSetId,
      translationChunkSetId: translationString.chunkSetId,
      memoryId: memoryItem.memoryId,
      creatorId: memoryItem.creatorId,
      createdAt: memoryItem.createdAt,
      updatedAt: memoryItem.updatedAt,
      chunkId: chunk.id,
    })
    .from(memoryItem)
    .innerJoin(sourceString, eq(sourceString.id, memoryItem.sourceStringId))
    .innerJoin(
      translationString,
      eq(translationString.id, memoryItem.translationStringId),
    )
    .innerJoin(
      targetSetsQuery,
      eq(sourceString.chunkSetId, targetSetsQuery.chunkSetId),
    )
    .innerJoin(chunk, eq(chunk.chunkSetId, sourceString.chunkSetId))
    .where(inArray(chunk.id, searchedChunkIds));

  const translationItemsQuery = drizzle
    .select({
      id: memoryItem.id,
      source: sourceString.value,
      translation: translationString.value,
      sourceChunkSetId: sourceString.chunkSetId,
      translationChunkSetId: translationString.chunkSetId,
      memoryId: memoryItem.memoryId,
      creatorId: memoryItem.creatorId,
      createdAt: memoryItem.createdAt,
      updatedAt: memoryItem.updatedAt,
      chunkId: chunk.id,
    })
    .from(memoryItem)
    .innerJoin(sourceString, eq(sourceString.id, memoryItem.sourceStringId))
    .innerJoin(
      translationString,
      eq(translationString.id, memoryItem.translationStringId),
    )
    .innerJoin(
      targetSetsQuery,
      eq(translationString.chunkSetId, targetSetsQuery.chunkSetId),
    )
    .innerJoin(chunk, eq(chunk.chunkSetId, translationString.chunkSetId))
    .where(inArray(chunk.id, searchedChunkIds));

  const rows = await union(sourceItemsQuery, translationItemsQuery).limit(
    maxAmount,
  );

  const result = rows
    .map((row) => ({
      ...row,
      similarity: searchResult.get(row.chunkId) ?? 0,
    }))
    .sort((a, b) => b.similarity - a.similarity);

  return result;
};
