import {
  and,
  asc,
  contentRelation,
  eq,
  exists,
  getColumns,
  ilike,
  isNotNull,
  sql,
  translatableElement,
  translation,
  vectorizedString,
  type SQL,
} from "@cat/db";
import * as z from "zod";

import type { DbHandle, Query } from "@/types";

import { buildTranslationStatusConditions } from "@/queries/translation/build-translation-status-conditions";

export const ElementTranslationStatusSchema = z.enum([
  "NO",
  "TRANSLATED",
  "APPROVED",
]);
export type ElementTranslationStatus = z.infer<
  typeof ElementTranslationStatusSchema
>;

export const GetContentNodeElementsQuerySchema = z.object({
  contentNodeId: z.uuidv4(),
  page: z.int().min(0).default(0),
  pageSize: z.int().min(1).default(16),
  searchQuery: z.string().default("").optional(),
  isApproved: z.boolean().optional(),
  isTranslated: z.boolean().optional(),
  languageId: z.string().optional(),
});
export type GetContentNodeElementsQuery = z.infer<
  typeof GetContentNodeElementsQuerySchema
>;

export type ContentNodeElementRow = typeof translatableElement.$inferSelect & {
  value: string;
  languageId: string;
  status: ElementTranslationStatus;
  primaryContentNodeId: string | null;
  localOrder: number | null;
};

const buildStatusSql = (
  db: DbHandle,
  languageId?: string,
): SQL<ElementTranslationStatus> => {
  if (!languageId) return sql<ElementTranslationStatus>`'NO'`;

  return sql<ElementTranslationStatus>`CASE
    WHEN ${and(
      isNotNull(translatableElement.approvedTranslationId),
      exists(
        db
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
      db
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
  END`;
};

export const getContentNodeElements: Query<
  GetContentNodeElementsQuery,
  ContentNodeElementRow[]
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

  return ctx.db
    .select({
      ...getColumns(translatableElement),
      value: vectorizedString.value,
      languageId: vectorizedString.languageId,
      status: buildStatusSql(ctx.db, query.languageId).as("status"),
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
    .limit(query.pageSize)
    .offset(query.page * query.pageSize);
};
