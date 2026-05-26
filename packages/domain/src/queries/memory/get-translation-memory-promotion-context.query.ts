import {
  aliasedTable,
  eq,
  translatableElement,
  translation,
  vectorizedString,
} from "@cat/db";
import { assertSingleOrNull } from "@cat/shared";
import * as z from "zod";

import type { Query } from "@/types";

export const GetTranslationMemoryPromotionContextQuerySchema = z.object({
  translationId: z.int(),
});

export type GetTranslationMemoryPromotionContextQuery = z.infer<
  typeof GetTranslationMemoryPromotionContextQuerySchema
>;

export type TranslationMemoryPromotionContext = {
  translationId: number;
  projectId: string;
  sourceElementId: number;
  translatorId: string | null;
  sourceStringId: number;
  translationStringId: number;
  sourceText: string;
  translationText: string;
  sourceLanguageId: string;
  translationLanguageId: string;
};

export const getTranslationMemoryPromotionContext: Query<
  GetTranslationMemoryPromotionContextQuery,
  TranslationMemoryPromotionContext | null
> = async (ctx, query) => {
  const sourceString = aliasedTable(vectorizedString, "sourceString");
  const translationString = aliasedTable(vectorizedString, "translationString");

  const rows = await ctx.db
    .select({
      translationId: translation.id,
      projectId: translatableElement.projectId,
      sourceElementId: translatableElement.id,
      translatorId: translation.translatorId,
      sourceStringId: translatableElement.vectorizedStringId,
      translationStringId: translation.stringId,
      sourceText: sourceString.value,
      translationText: translationString.value,
      sourceLanguageId: sourceString.languageId,
      translationLanguageId: translationString.languageId,
    })
    .from(translation)
    .innerJoin(
      translatableElement,
      eq(translation.translatableElementId, translatableElement.id),
    )
    .innerJoin(
      sourceString,
      eq(sourceString.id, translatableElement.vectorizedStringId),
    )
    .innerJoin(
      translationString,
      eq(translationString.id, translation.stringId),
    )
    .where(eq(translation.id, query.translationId))
    .limit(1);

  return assertSingleOrNull(rows);
};
