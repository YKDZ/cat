import {
  and,
  asc,
  eq,
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
import { assertSingleNonNullish } from "@cat/shared/utils";
import * as z from "zod/v4";

import type { Query } from "@/types";

export const GetElementInfoQuerySchema = z.object({
  elementId: z.int(),
  languageId: z.string().optional(),
});

export type GetElementInfoQuery = z.infer<typeof GetElementInfoQuerySchema>;

export const ElementInfoQueryResultSchema = z.object({
  elementId: z.int(),
  documentId: z.uuidv4(),
  sourceText: z.string(),
  sourceLanguageId: z.string(),
  sortIndex: z.int().nullable(),
  contexts: z.array(
    TranslatableElementContextSchema.pick({
      fileId: true,
      storageProviderId: true,
      type: true,
      jsonData: true,
      textData: true,
    }),
  ),
  meta: safeZDotJson,
  translations: z.array(
    z.object({
      translationId: z.int(),
      text: z.string(),
      languageId: z.string(),
      isApproved: z.boolean(),
    }),
  ),
});

export type ElementInfoQueryResult = z.infer<
  typeof ElementInfoQueryResultSchema
>;

export const getElementInfo: Query<
  GetElementInfoQuery,
  ElementInfoQueryResult
> = async (ctx, query) => {
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

  const element = assertSingleNonNullish(
    await ctx.db
      .select({
        elementId: translatableElement.id,
        documentId: translatableElement.documentId,
        sortIndex: translatableElement.sortIndex,
        approvedTranslationId: translatableElement.approvedTranslationId,
        sourceText: vectorizedString.value,
        sourceLanguageId: vectorizedString.languageId,
        meta: translatableElement.meta,
        contexts: contextsSubquery.contextsArray,
      })
      .from(translatableElement)
      .innerJoin(
        vectorizedString,
        eq(translatableElement.vectorizedStringId, vectorizedString.id),
      )
      .leftJoin(
        contextsSubquery,
        eq(contextsSubquery.elementId, translatableElement.id),
      )
      .where(eq(translatableElement.id, query.elementId))
      .limit(1),
    `Element with ID ${query.elementId} not found`,
  );

  const translationConditions = [
    eq(translation.translatableElementId, query.elementId),
  ];
  if (query.languageId) {
    translationConditions.push(
      eq(vectorizedString.languageId, query.languageId),
    );
  }

  const translationRows = await ctx.db
    .select({
      translationId: translation.id,
      text: vectorizedString.value,
      languageId: vectorizedString.languageId,
    })
    .from(translation)
    .innerJoin(vectorizedString, eq(translation.stringId, vectorizedString.id))
    .where(and(...translationConditions))
    .orderBy(asc(translation.createdAt));

  return {
    elementId: element.elementId,
    documentId: element.documentId,
    sourceText: element.sourceText,
    sourceLanguageId: element.sourceLanguageId,
    sortIndex: element.sortIndex,
    contexts: element.contexts ?? [],
    meta: element.meta,
    translations: translationRows.map((row) => ({
      translationId: row.translationId,
      text: row.text,
      languageId: row.languageId,
      isApproved: element.approvedTranslationId === row.translationId,
    })),
  };
};
