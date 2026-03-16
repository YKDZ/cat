import {
  and,
  asc,
  eq,
  exists,
  getColumns,
  ilike,
  isNotNull,
  sql,
  translatableElement,
  translatableString,
  translation,
  type SQL,
} from "@cat/db";
import * as z from "zod/v4";

import type { DbHandle, Query } from "@/types";

import { buildTranslationStatusConditions } from "@/queries/document/build-translation-status-conditions";

export const ElementTranslationStatusSchema = z.enum([
  "NO",
  "TRANSLATED",
  "APPROVED",
]);

export type ElementTranslationStatus = z.infer<
  typeof ElementTranslationStatusSchema
>;

export const GetDocumentElementsQuerySchema = z.object({
  documentId: z.uuidv4(),
  page: z.int().min(0).default(0),
  pageSize: z.int().min(1).default(16),
  searchQuery: z.string().default("").optional(),
  isApproved: z.boolean().optional(),
  isTranslated: z.boolean().optional(),
  languageId: z.string().optional(),
});

export type GetDocumentElementsQuery = z.infer<
  typeof GetDocumentElementsQuerySchema
>;

export type DocumentElementRow = typeof translatableElement.$inferSelect & {
  value: string;
  languageId: string;
  status: ElementTranslationStatus;
};

const buildStatusSql = (
  db: DbHandle,
  languageId?: string,
): SQL<ElementTranslationStatus> => {
  if (!languageId) {
    return sql<ElementTranslationStatus>`'NO'`;
  }

  return sql<ElementTranslationStatus>`CASE
    WHEN ${and(
      isNotNull(translatableElement.approvedTranslationId),
      exists(
        db
          .select()
          .from(translation)
          .innerJoin(
            translatableString,
            eq(translation.stringId, translatableString.id),
          )
          .where(
            and(
              eq(translation.id, translatableElement.approvedTranslationId),
              eq(translatableString.languageId, languageId),
            ),
          ),
      ),
    )} THEN 'APPROVED'
    WHEN ${exists(
      db
        .select()
        .from(translation)
        .innerJoin(
          translatableString,
          eq(translation.stringId, translatableString.id),
        )
        .where(
          and(
            eq(translation.translatableElementId, translatableElement.id),
            eq(translatableString.languageId, languageId),
          ),
        ),
    )} THEN 'TRANSLATED'
    ELSE 'NO'
  END`;
};

export const getDocumentElements: Query<
  GetDocumentElementsQuery,
  DocumentElementRow[]
> = async (ctx, query) => {
  const whereConditions = [
    eq(translatableElement.documentId, query.documentId),
  ];

  if (query.searchQuery && query.searchQuery.trim().length > 0) {
    whereConditions.push(
      ilike(translatableString.value, `%${query.searchQuery}%`),
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
      value: translatableString.value,
      languageId: translatableString.languageId,
      status: buildStatusSql(ctx.db, query.languageId).as("status"),
    })
    .from(translatableElement)
    .innerJoin(
      translatableString,
      eq(translatableElement.translatableStringId, translatableString.id),
    )
    .where(
      whereConditions.length === 1
        ? whereConditions[0]
        : and(...whereConditions),
    )
    .orderBy(asc(translatableElement.sortIndex))
    .limit(query.pageSize)
    .offset(query.page * query.pageSize);
};
