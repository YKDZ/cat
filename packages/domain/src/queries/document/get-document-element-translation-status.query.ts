import {
  and,
  eq,
  translatableElement,
  translation,
  vectorizedString,
} from "@cat/db";
import { assertSingleNonNullish } from "@cat/shared";
import * as z from "zod";

import type { Query } from "@/types";

import {
  ElementTranslationStatusSchema,
  type ElementTranslationStatus,
} from "@/queries/document/get-document-elements.query";

export const GetDocumentElementTranslationStatusQuerySchema = z.object({
  elementId: z.int(),
  languageId: z.string(),
});

export type GetDocumentElementTranslationStatusQuery = z.infer<
  typeof GetDocumentElementTranslationStatusQuerySchema
>;

export const getDocumentElementTranslationStatus: Query<
  GetDocumentElementTranslationStatusQuery,
  ElementTranslationStatus
> = async (ctx, query) => {
  const row = assertSingleNonNullish(
    await ctx.db
      .select({
        approvedTranslationId: translatableElement.approvedTranslationId,
      })
      .from(translatableElement)
      .where(eq(translatableElement.id, query.elementId)),
    `Element ${query.elementId} not found`,
  );

  const translations = await ctx.db
    .select({ id: translation.id })
    .from(translation)
    .innerJoin(vectorizedString, eq(translation.stringId, vectorizedString.id))
    .where(
      and(
        eq(translation.translatableElementId, query.elementId),
        eq(vectorizedString.languageId, query.languageId),
      ),
    );

  if (translations.length === 0) {
    return ElementTranslationStatusSchema.enum.NO;
  }

  if (row.approvedTranslationId) {
    return ElementTranslationStatusSchema.enum.APPROVED;
  }

  return ElementTranslationStatusSchema.enum.TRANSLATED;
};
