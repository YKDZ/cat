import {
  and,
  contentRelation,
  count,
  eq,
  isNotNull,
  translation,
  translatableElement,
  vectorizedString,
} from "@cat/db";
import * as z from "zod";

import type { Query } from "@/types";

export const CountContentNodeTranslationsQuerySchema = z.object({
  contentNodeId: z.uuidv4(),
  languageId: z.string(),
  isApproved: z.boolean().optional(),
});
export type CountContentNodeTranslationsQuery = z.infer<
  typeof CountContentNodeTranslationsQuerySchema
>;

/**
 * Count translations for a given language under a content node.
 */
export const countContentNodeTranslations: Query<
  CountContentNodeTranslationsQuery,
  number
> = async (ctx, query) => {
  const { contentNodeId, languageId, isApproved } = query;

  const whereConditions = [
    eq(contentRelation.sourceNodeId, contentNodeId),
    eq(contentRelation.targetEndpointKind, "ELEMENT"),
    eq(contentRelation.isPrimary, true),
    eq(vectorizedString.languageId, languageId),
  ];

  if (isApproved === true) {
    whereConditions.push(isNotNull(translatableElement.approvedTranslationId));
  }

  const rows = await ctx.db
    .select({ total: count() })
    .from(contentRelation)
    .innerJoin(
      translatableElement,
      eq(contentRelation.targetElementId, translatableElement.id),
    )
    .innerJoin(
      translation,
      eq(translation.translatableElementId, translatableElement.id),
    )
    .innerJoin(vectorizedString, eq(translation.stringId, vectorizedString.id))
    .where(and(...whereConditions));

  return rows[0]?.total ?? 0;
};
