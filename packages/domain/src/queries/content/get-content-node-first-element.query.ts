import {
  and,
  asc,
  contentRelation,
  eq,
  getColumns,
  gt,
  ilike,
  sql,
  translatableElement,
  vectorizedString,
  type SQL,
} from "@cat/db";
import * as z from "zod";

import type {
  ContentNodeElementRow,
  ElementTranslationStatus,
} from "@/queries/content/get-content-node-elements.query";
import type { Query } from "@/types";

import { buildTranslationStatusConditions } from "@/queries/translation/build-translation-status-conditions";

export const GetContentNodeFirstElementQuerySchema = z.object({
  contentNodeId: z.uuidv4(),
  searchQuery: z.string().default("").optional(),
  greaterThan: z.int().optional(),
  afterElementId: z.int().optional(),
  isApproved: z.boolean().optional(),
  isTranslated: z.boolean().optional(),
  languageId: z.string().optional(),
});
export type GetContentNodeFirstElementQuery = z.infer<
  typeof GetContentNodeFirstElementQuerySchema
>;

/**
 * Get the first translatable element under a content node matching the given filters.
 */
export const getContentNodeFirstElement: Query<
  GetContentNodeFirstElementQuery,
  ContentNodeElementRow | null
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

  if (query.greaterThan !== undefined) {
    whereConditions.push(gt(contentRelation.localOrder, query.greaterThan));
  }

  if (query.afterElementId !== undefined) {
    whereConditions.push(gt(translatableElement.id, query.afterElementId));
  }

  const rows = await ctx.db
    .select({
      ...getColumns(translatableElement),
      value: vectorizedString.value,
      languageId: vectorizedString.languageId,
      status: sql<ElementTranslationStatus>`'NO'`.as("status"),
      primaryContentNodeId: contentRelation.sourceNodeId,
      localOrder: contentRelation.localOrder,
    })
    .from(contentRelation)
    .innerJoin(
      translatableElement,
      eq(contentRelation.targetElementId, translatableElement.id),
    )
    .innerJoin(
      vectorizedString,
      eq(translatableElement.vectorizedStringId, vectorizedString.id),
    )
    .where(and(...whereConditions))
    .orderBy(asc(contentRelation.localOrder), asc(translatableElement.id))
    .limit(1);

  return rows[0] ?? null;
};
