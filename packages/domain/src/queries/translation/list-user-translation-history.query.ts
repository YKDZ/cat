import {
  alias,
  and,
  asc,
  document,
  eq,
  gt,
  sql,
  translatableElement,
  translatableElementContext,
  vectorizedString,
  translation,
} from "@cat/db";
import {
  type TranslatableElementContext,
  TranslatableElementContextSchema,
} from "@cat/shared/schema/drizzle/document";
import { safeZDotJson } from "@cat/shared/schema/json";
import * as z from "zod";

import type { Query } from "@/types";

export const ListUserTranslationHistoryQuerySchema = z.object({
  projectId: z.uuidv4(),
  userId: z.uuidv4(),
  sourceLanguageId: z.string().optional(),
  translationLanguageId: z.string().optional(),
  cursor: z.int().positive().optional(),
  limit: z.int().min(1).max(32).default(20),
});

export type ListUserTranslationHistoryQuery = z.infer<
  typeof ListUserTranslationHistoryQuerySchema
>;

export const UserTranslationHistoryItemSchema = z.object({
  translationId: z.int(),
  element: z.string(),
  elementMeta: safeZDotJson,
  elementContexts: z.array(
    TranslatableElementContextSchema.pick({
      fileId: true,
      storageProviderId: true,
      type: true,
      jsonData: true,
      textData: true,
    }),
  ),
  translation: z.string(),
  sourceLanguageId: z.string(),
  translationLanguageId: z.string(),
  documentId: z.uuidv4(),
});

export const ListUserTranslationHistoryResultSchema = z.object({
  translations: z.array(UserTranslationHistoryItemSchema),
  nextCursor: z.number().nullable(),
  hasMore: z.boolean(),
});

export type ListUserTranslationHistoryResult = z.infer<
  typeof ListUserTranslationHistoryResultSchema
>;

export const listUserTranslationHistory: Query<
  ListUserTranslationHistoryQuery,
  ListUserTranslationHistoryResult
> = async (ctx, query) => {
  const sourceString = alias(vectorizedString, "sourceString");
  const translationString = alias(vectorizedString, "translationString");

  const conditions = [
    eq(document.projectId, query.projectId),
    eq(translation.translatorId, query.userId),
  ];

  if (query.sourceLanguageId) {
    conditions.push(eq(sourceString.languageId, query.sourceLanguageId));
  }

  if (query.translationLanguageId) {
    conditions.push(
      eq(translationString.languageId, query.translationLanguageId),
    );
  }

  if (query.cursor !== undefined) {
    conditions.push(gt(translation.id, query.cursor));
  }

  const contextsSubquery = ctx.db
    .select({
      elementId: translatableElementContext.translatableElementId,
      contextsArray: sql<TranslatableElementContext[]>`json_agg(
        json_build_object(
          'type',                  ${translatableElementContext.type},
          'jsonData',              ${translatableElementContext.jsonData},
          'fileId',                ${translatableElementContext.fileId},
          'storageProviderId',     ${translatableElementContext.storageProviderId},
          'textData',              ${translatableElementContext.textData}
        )
      )`.as("contexts_array"),
    })
    .from(translatableElementContext)
    .groupBy(translatableElementContext.translatableElementId)
    .as("contexts_subquery");

  const rows = await ctx.db
    .select({
      translationId: translation.id,
      element: sourceString.value,
      elementMeta: translatableElement.meta,
      translation: translationString.value,
      sourceLanguageId: sourceString.languageId,
      translationLanguageId: translationString.languageId,
      documentId: document.id,
      elementContexts: contextsSubquery.contextsArray,
    })
    .from(translation)
    .innerJoin(
      translatableElement,
      eq(translation.translatableElementId, translatableElement.id),
    )
    .innerJoin(
      sourceString,
      eq(translatableElement.vectorizedStringId, sourceString.id),
    )
    .leftJoin(
      contextsSubquery,
      eq(contextsSubquery.elementId, translatableElement.id),
    )
    .innerJoin(document, eq(translatableElement.documentId, document.id))
    .innerJoin(
      translationString,
      eq(translation.stringId, translationString.id),
    )
    .where(and(...conditions))
    .orderBy(asc(translation.id))
    .limit(query.limit + 1);

  const hasNextPage = rows.length > query.limit;
  const pageRows = hasNextPage ? rows.slice(0, query.limit) : rows;

  return {
    translations: pageRows.map((row) => ({
      ...row,
      elementContexts: row.elementContexts ?? [],
    })),
    nextCursor: hasNextPage
      ? (pageRows[pageRows.length - 1]?.translationId ?? null)
      : null,
    hasMore: hasNextPage,
  };
};
