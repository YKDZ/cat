import {
  alias,
  and,
  contentRelation,
  eq,
  translatableElement,
  translation,
  vectorizedString,
} from "@cat/db";
import * as z from "zod";

import type { Query } from "@/types";

export const GetTranslationQaContextQuerySchema = z.object({
  translationId: z.int(),
});

export type GetTranslationQaContextQuery = z.infer<
  typeof GetTranslationQaContextQuerySchema
>;

export type TranslationQaContext = {
  projectId: string;
  elementId: number;
  translationId: number;
  translatorId: string | null;
  approvedTranslationId: number | null;
  primaryContentNodeId: string | null;
  translationText: string;
  translationLanguageId: string;
  elementText: string;
  elementLanguageId: string;
};

const translationString = alias(vectorizedString, "translationString");
const elementString = alias(vectorizedString, "elementString");

/**
 * Fetch the context required to run translation QA (translation text, source text, language info).
 */
export const getTranslationQaContext: Query<
  GetTranslationQaContextQuery,
  TranslationQaContext | null
> = async (ctx, query) => {
  const rows = await ctx.db
    .select({
      projectId: translatableElement.projectId,
      elementId: translatableElement.id,
      translationId: translation.id,
      translatorId: translation.translatorId,
      approvedTranslationId: translatableElement.approvedTranslationId,
      primaryContentNodeId: contentRelation.sourceNodeId,
      translationText: translationString.value,
      translationLanguageId: translationString.languageId,
      elementText: elementString.value,
      elementLanguageId: elementString.languageId,
    })
    .from(translation)
    .innerJoin(
      translationString,
      eq(translationString.id, translation.stringId),
    )
    .innerJoin(
      translatableElement,
      eq(translatableElement.id, translation.translatableElementId),
    )
    .leftJoin(
      contentRelation,
      and(
        eq(contentRelation.targetElementId, translatableElement.id),
        eq(contentRelation.targetEndpointKind, "ELEMENT"),
        eq(contentRelation.sourceEndpointKind, "NODE"),
        eq(contentRelation.isPrimary, true),
      ),
    )
    .innerJoin(
      elementString,
      eq(elementString.id, translatableElement.vectorizedStringId),
    )
    .where(eq(translation.id, query.translationId))
    .limit(1);

  return rows[0] ?? null;
};
