import {
  eq,
  getColumns,
  inArray,
  sql,
  sumDistinct,
  translation,
  translationVote,
  translatableString,
} from "@cat/db";
import * as z from "zod/v4";

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
      text: translatableString.value,
      vote: sql<number>`COALESCE(${sumDistinct(translationVote.value)}, 0)`.mapWith(
        Number,
      ),
    })
    .from(translation)
    .innerJoin(
      translatableString,
      eq(translatableString.id, translation.stringId),
    )
    .leftJoin(
      translationVote,
      eq(translationVote.translationId, translation.id),
    )
    .where(inArray(translation.id, query.translationIds))
    .groupBy(translation.id, translatableString.value);
};
