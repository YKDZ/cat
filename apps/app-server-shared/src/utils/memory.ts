import {
  aliasedTable,
  chunk,
  eq,
  inArray,
  memoryItem,
  translatableElement,
  translatableString,
  translation,
  union,
  type DrizzleTransaction,
} from "@cat/db";
import { MemorySuggestion } from "@cat/shared/schema/misc";

export const searchMemory = async (
  drizzle: DrizzleTransaction,
  chunks: { chunkId: number; similarity: number }[],
  sourceLanguageId: string,
  translationLanguageId: string,
  memoryIds: string[],
  maxAmount: number = 3,
): Promise<MemorySuggestion[]> => {
  const sourceString = aliasedTable(translatableString, "sourceString");
  const translationString = aliasedTable(
    translatableString,
    "translationString",
  );

  const searchResult = new Map(chunks.map((it) => [it.chunkId, it.similarity]));
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
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt),
    }))
    .sort((a, b) => b.similarity - a.similarity);

  return result;
};

export const insertMemory = async (
  tx: DrizzleTransaction,
  memoryIds: string[],
  translationIds: number[],
): Promise<{ memoryItemIds: number[] }> => {
  if (translationIds.length === 0 || memoryIds.length === 0) {
    return { memoryItemIds: [] };
  }

  const translations = await tx
    .select({
      translationId: translation.id,
      translationStringId: translation.stringId,
      sourceStringId: translatableElement.translatableStringId,
      creatorId: translation.translatorId,
    })
    .from(translation)
    .innerJoin(
      translatableElement,
      eq(translation.translatableElementId, translatableElement.id),
    )
    .where(inArray(translation.id, translationIds));

  const ids: number[] = [];

  await Promise.all(
    memoryIds.map(async (memoryId) => {
      const inserted = await tx
        .insert(memoryItem)
        .values(
          translations.map((t) => ({
            ...t,
            memoryId,
          })),
        )
        .returning({ id: memoryItem.id });
      ids.push(...inserted.map((i) => i.id));
    }),
  );

  return { memoryItemIds: ids };
};
