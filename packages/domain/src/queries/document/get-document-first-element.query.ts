import {
  and,
  asc,
  eq,
  getColumns,
  gt,
  ilike,
  or,
  translatableElement,
  vectorizedString,
} from "@cat/db";
import * as z from "zod";

import type { Query } from "@/types";

import { buildTranslationStatusConditions } from "@/queries/document/build-translation-status-conditions";

export const GetDocumentFirstElementQuerySchema = z.object({
  documentId: z.uuidv4(),
  searchQuery: z.string().default(""),
  greaterThan: z.int().optional(),
  afterElementId: z.int().optional(),
  isApproved: z.boolean().optional(),
  isTranslated: z.boolean().optional(),
  languageId: z.string().optional(),
});

export type GetDocumentFirstElementQuery = z.infer<
  typeof GetDocumentFirstElementQuerySchema
>;

export const getDocumentFirstElement: Query<
  GetDocumentFirstElementQuery,
  typeof translatableElement.$inferSelect | null
> = async (ctx, query) => {
  const whereConditions = [
    eq(translatableElement.documentId, query.documentId),
  ];

  if (query.searchQuery.trim().length > 0) {
    whereConditions.push(
      ilike(vectorizedString.value, `%${query.searchQuery}%`),
    );
  }

  if (query.greaterThan !== undefined && query.afterElementId !== undefined) {
    whereConditions.push(
      or(
        gt(translatableElement.sortIndex, query.greaterThan),
        and(
          eq(translatableElement.sortIndex, query.greaterThan),
          gt(translatableElement.id, query.afterElementId),
        ),
      )!,
    );
  } else if (query.greaterThan !== undefined) {
    whereConditions.push(gt(translatableElement.sortIndex, query.greaterThan));
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
    .select(getColumns(translatableElement))
    .from(translatableElement)
    .innerJoin(
      vectorizedString,
      eq(translatableElement.vectorizedStringId, vectorizedString.id),
    )
    .where(
      whereConditions.length === 1
        ? whereConditions[0]
        : and(...whereConditions),
    )
    .orderBy(asc(translatableElement.sortIndex), asc(translatableElement.id))
    .limit(1);

  return rows[0] ?? null;
};
