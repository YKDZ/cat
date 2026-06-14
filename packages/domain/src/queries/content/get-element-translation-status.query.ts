import {
  and,
  eq,
  exists,
  isNotNull,
  sql,
  translatableElement,
  translation,
  vectorizedString,
} from "@cat/db";
import * as z from "zod";

import type { Query } from "@/types";

import {
  ElementTranslationStatusSchema,
  type ElementTranslationStatus,
} from "@/queries/content/get-content-node-elements.query";
import { hasBranchTranslationOverlayQuery } from "@/queries/content/has-branch-translation-overlay.query";

export const GetElementTranslationStatusQuerySchema = z.object({
  elementId: z.int(),
  languageId: z.string(),
  branchId: z.int().positive().optional(),
});
export type GetElementTranslationStatusQuery = z.infer<
  typeof GetElementTranslationStatusQuerySchema
>;

/**
 * Get the translation status for a single translatable element.
 */
export const getElementTranslationStatus: Query<
  GetElementTranslationStatusQuery,
  ElementTranslationStatus
> = async (ctx, query) => {
  const { elementId, languageId } = query;

  const branchTranslatedExists =
    query.branchId === undefined
      ? false
      : await hasBranchTranslationOverlayQuery(ctx, {
          branchId: query.branchId,
          elementId: query.elementId,
          languageId: query.languageId,
        });

  if (branchTranslatedExists) {
    return ElementTranslationStatusSchema.enum.TRANSLATED;
  }

  const rows = await ctx.db
    .select({
      status: sql<ElementTranslationStatus>`CASE
        WHEN ${and(
          isNotNull(translatableElement.approvedTranslationId),
          exists(
            ctx.db
              .select()
              .from(translation)
              .innerJoin(
                vectorizedString,
                eq(translation.stringId, vectorizedString.id),
              )
              .where(
                and(
                  eq(translation.id, translatableElement.approvedTranslationId),
                  eq(vectorizedString.languageId, languageId),
                ),
              ),
          ),
        )} THEN 'APPROVED'
        WHEN ${exists(
          ctx.db
            .select()
            .from(translation)
            .innerJoin(
              vectorizedString,
              eq(translation.stringId, vectorizedString.id),
            )
            .where(
              and(
                eq(translation.translatableElementId, translatableElement.id),
                eq(vectorizedString.languageId, languageId),
              ),
            ),
        )} THEN 'TRANSLATED'
        ELSE 'NO'
      END`,
    })
    .from(translatableElement)
    .where(eq(translatableElement.id, elementId))
    .limit(1);

  return rows[0]?.status ?? ElementTranslationStatusSchema.enum.NO;
};
