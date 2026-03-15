import {
  and,
  eq,
  sql,
  sumDistinct,
  translation,
  translationVote,
  translatableString,
} from "@cat/db";
import * as z from "zod/v4";

import type { Query } from "@/types";

export const ListTranslationsByElementQuerySchema = z.object({
  elementId: z.int(),
  languageId: z.string(),
});

export type ListTranslationsByElementQuery = z.infer<
  typeof ListTranslationsByElementQuerySchema
>;

export type TranslationListItem = Omit<
  typeof translation.$inferSelect,
  "stringId" | "updatedAt"
> & {
  text: string;
  vote: number;
};

export const listTranslationsByElement: Query<
  ListTranslationsByElementQuery,
  TranslationListItem[]
> = async (ctx, query) => {
  return ctx.db
    .select({
      id: translation.id,
      translatableElementId: translation.translatableElementId,
      text: translatableString.value,
      vote: sql<number>`COALESCE(${sumDistinct(translationVote.value)}, 0)`.mapWith(
        Number,
      ),
      translatorId: translation.translatorId,
      meta: translation.meta,
      createdAt: translation.createdAt,
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
    .where(
      and(
        eq(translatableString.languageId, query.languageId),
        eq(translation.translatableElementId, query.elementId),
      ),
    )
    .groupBy(translation.id, translatableString.value);
};
