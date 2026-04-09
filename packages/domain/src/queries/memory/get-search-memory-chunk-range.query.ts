import {
  aliasedTable,
  and,
  chunk,
  eq,
  inArray,
  memoryItem,
  vectorizedString,
} from "@cat/db";
import * as z from "zod/v4";

import type { Query } from "@/types";

export const GetSearchMemoryChunkRangeQuerySchema = z.object({
  memoryIds: z.array(z.uuidv4()),
  sourceLanguageId: z.string(),
  translationLanguageId: z.string(),
});

export type GetSearchMemoryChunkRangeQuery = z.infer<
  typeof GetSearchMemoryChunkRangeQuerySchema
>;

export const getSearchMemoryChunkRange: Query<
  GetSearchMemoryChunkRangeQuery,
  number[]
> = async (ctx, query) => {
  if (query.memoryIds.length === 0) {
    return [];
  }

  const sourceString = aliasedTable(vectorizedString, "sourceString");
  const translationString = aliasedTable(vectorizedString, "translationString");

  const [sourceChunkIds, reversedChunkIds] = await Promise.all([
    ctx.db
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
          inArray(memoryItem.memoryId, query.memoryIds),
          eq(sourceString.languageId, query.sourceLanguageId),
          eq(translationString.languageId, query.translationLanguageId),
        ),
      ),
    ctx.db
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
          inArray(memoryItem.memoryId, query.memoryIds),
          eq(translationString.languageId, query.sourceLanguageId),
          eq(sourceString.languageId, query.translationLanguageId),
        ),
      ),
  ]);

  return Array.from(
    new Set([...sourceChunkIds, ...reversedChunkIds].map((row) => row.id)),
  );
};
