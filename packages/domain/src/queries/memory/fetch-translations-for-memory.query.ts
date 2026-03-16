import {
  aliasedTable,
  eq,
  inArray,
  translatableElement,
  translatableString,
  translation,
} from "@cat/db";
import * as z from "zod/v4";

import type { Query } from "@/types";

export const FetchTranslationsForMemoryQuerySchema = z.object({
  translationIds: z.array(z.int()),
});

export type FetchTranslationsForMemoryQuery = z.infer<
  typeof FetchTranslationsForMemoryQuerySchema
>;

export type TranslationForMemoryRow = {
  translationId: number;
  translationStringId: number;
  sourceStringId: number;
  creatorId: string | null;
  sourceText: string;
  translationText: string;
};

export const fetchTranslationsForMemory: Query<
  FetchTranslationsForMemoryQuery,
  TranslationForMemoryRow[]
> = async (ctx, query) => {
  if (query.translationIds.length === 0) return [];

  const sourceString = aliasedTable(translatableString, "sourceString");
  const translationString = aliasedTable(
    translatableString,
    "translationString",
  );

  return ctx.db
    .select({
      translationId: translation.id,
      translationStringId: translation.stringId,
      sourceStringId: translatableElement.translatableStringId,
      creatorId: translation.translatorId,
      sourceText: sourceString.value,
      translationText: translationString.value,
    })
    .from(translation)
    .innerJoin(
      translatableElement,
      eq(translation.translatableElementId, translatableElement.id),
    )
    .innerJoin(
      sourceString,
      eq(sourceString.id, translatableElement.translatableStringId),
    )
    .innerJoin(
      translationString,
      eq(translationString.id, translation.stringId),
    )
    .where(inArray(translation.id, query.translationIds));
};
