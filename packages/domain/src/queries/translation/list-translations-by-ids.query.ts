import {
  eq,
  getColumns,
  inArray,
  sql,
  sumDistinct,
  translation,
  translationVote,
  vectorizedString,
} from "@cat/db";
import * as z from "zod";

import type { Query } from "@/types";

export const ListTranslationsByIdsQuerySchema = z.object({
  translationIds: z.array(z.int()),
});

export type ListTranslationsByIdsQuery = z.infer<
  typeof ListTranslationsByIdsQuerySchema
>;

export type TranslationWithVoteAndText = Omit<
  typeof translation.$inferSelect,
  "stringId" | "updatedAt"
> & {
  text: string;
  vote: number;
};

export const listTranslationsByIds: Query<
  ListTranslationsByIdsQuery,
  TranslationWithVoteAndText[]
> = async (ctx, query) => {
  if (query.translationIds.length === 0) {
    return [];
  }

  return ctx.db
    .select({
      ...getColumns(translation),
      text: vectorizedString.value,
      vote: sql<number>`COALESCE(${sumDistinct(translationVote.value)}, 0)`.mapWith(
        Number,
      ),
    })
    .from(translation)
    .innerJoin(vectorizedString, eq(vectorizedString.id, translation.stringId))
    .leftJoin(
      translationVote,
      eq(translationVote.translationId, translation.id),
    )
    .where(inArray(translation.id, query.translationIds))
    .groupBy(translation.id, vectorizedString.value);
};
