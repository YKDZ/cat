import {
  aliasedTable,
  and,
  chunk,
  eq,
  inArray,
  memoryItem,
  translatableString,
  union,
} from "@cat/db";
import * as z from "zod/v4";

import type { Query } from "@/types";

export const ListMemorySuggestionsByChunkIdsQuerySchema = z.object({
  searchedChunkIds: z.array(z.int()),
  memoryIds: z.array(z.uuidv4()),
  maxAmount: z.int().min(1),
});

export type ListMemorySuggestionsByChunkIdsQuery = z.infer<
  typeof ListMemorySuggestionsByChunkIdsQuerySchema
>;

export type MemorySuggestionCandidateRow = {
  id: number;
  source: string;
  translation: string;
  sourceChunkSetId: number;
  translationChunkSetId: number;
  memoryId: string;
  creatorId: string | null;
  createdAt: Date;
  updatedAt: Date;
  chunkId: number;
};

export const listMemorySuggestionsByChunkIds: Query<
  ListMemorySuggestionsByChunkIdsQuery,
  MemorySuggestionCandidateRow[]
> = async (ctx, query) => {
  if (query.searchedChunkIds.length === 0 || query.memoryIds.length === 0) {
    return [];
  }

  const sourceString = aliasedTable(translatableString, "sourceString");
  const translationString = aliasedTable(
    translatableString,
    "translationString",
  );

  const targetSetsQuery = ctx.db
    .selectDistinct({ chunkSetId: chunk.chunkSetId })
    .from(chunk)
    .where(inArray(chunk.id, query.searchedChunkIds))
    .as("target_sets");

  const sourceItemsQuery = ctx.db
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
    .where(
      and(
        inArray(chunk.id, query.searchedChunkIds),
        inArray(memoryItem.memoryId, query.memoryIds),
      ),
    );

  const translationItemsQuery = ctx.db
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
    .where(
      and(
        inArray(chunk.id, query.searchedChunkIds),
        inArray(memoryItem.memoryId, query.memoryIds),
      ),
    );

  return union(sourceItemsQuery, translationItemsQuery).limit(query.maxAmount);
};
