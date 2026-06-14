import {
  and,
  contentRelation,
  count,
  eq,
  ilike,
  translatableElement,
  vectorizedString,
  type SQL,
} from "@cat/db";
import * as z from "zod";

import type { Query } from "@/types";

import { buildTranslationStatusConditions } from "@/queries/translation/build-translation-status-conditions";

export const CountContentNodeElementsQuerySchema = z.object({
  contentNodeId: z.uuidv4(),
  searchQuery: z.string().default("").optional(),
  isApproved: z.boolean().optional(),
  isTranslated: z.boolean().optional(),
  languageId: z.string().optional(),
});
export type CountContentNodeElementsQuery = z.infer<
  typeof CountContentNodeElementsQuerySchema
>;

/**
 * Count translatable elements under a content node matching the given filters.
 */
export const countContentNodeElements: Query<
  CountContentNodeElementsQuery,
  number
> = async (ctx, query) => {
  const whereConditions: SQL[] = [
    eq(contentRelation.sourceNodeId, query.contentNodeId),
    eq(contentRelation.targetEndpointKind, "ELEMENT"),
    eq(contentRelation.isPrimary, true),
  ];

  if (query.searchQuery && query.searchQuery.trim().length > 0) {
    whereConditions.push(
      ilike(vectorizedString.value, `%${query.searchQuery}%`),
    );
  }

  whereConditions.push(
    ...buildTranslationStatusConditions(
      ctx.db,
      query.isTranslated,
      query.isApproved,
      query.languageId,
    ),
  );

  const rows = await ctx.db
    .select({ total: count() })
    .from(contentRelation)
    .innerJoin(
      translatableElement,
      eq(contentRelation.targetElementId, translatableElement.id),
    )
    .innerJoin(
      vectorizedString,
      eq(translatableElement.vectorizedStringId, vectorizedString.id),
    )
    .where(and(...whereConditions));

  return rows[0]?.total ?? 0;
};
