import {
  and,
  eq,
  sql,
  sumDistinct,
  translation,
  translationVote,
  vectorizedString,
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
      text: vectorizedString.value,
      vote: sql<number>`COALESCE(${sumDistinct(translationVote.value)}, 0)`.mapWith(
        Number,
      ),
      translatorId: translation.translatorId,
      meta: translation.meta,
      createdAt: translation.createdAt,
    })
    .from(translation)
    .innerJoin(vectorizedString, eq(vectorizedString.id, translation.stringId))
    .leftJoin(
      translationVote,
      eq(translationVote.translationId, translation.id),
    )
    .where(
      and(
        eq(vectorizedString.languageId, query.languageId),
        eq(translation.translatableElementId, query.elementId),
      ),
    )
    .groupBy(translation.id, vectorizedString.value);
};
