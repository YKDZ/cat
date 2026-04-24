import {
  aliasedTable,
  and,
  asc,
  eq,
  isNotNull,
  ne,
  sql,
  translatableElement,
  translation,
  vectorizedString,
} from "@cat/db";
import * as z from "zod";

import type { Query } from "@/types";

export const ListDocumentApprovedTranslationsQuerySchema = z.object({
  elementId: z.int(),
  languageId: z.string(),
  maxCount: z.int().min(0).default(5),
});

export type ListDocumentApprovedTranslationsQuery = z.infer<
  typeof ListDocumentApprovedTranslationsQuerySchema
>;

export type ApprovedTranslationEntry = {
  source: string;
  translation: string;
  elementId: number;
};

/**
 * @zh 查询同一文档中其他元素的已批准翻译，按与当前元素的邻近程度排序。
 * @en Query approved translations from other elements in the same document,
 *     ordered by proximity to the current element.
 */
export const listDocumentApprovedTranslations: Query<
  ListDocumentApprovedTranslationsQuery,
  ApprovedTranslationEntry[]
> = async (ctx, query) => {
  // 1. Get the reference element's documentId and sortIndex
  const refRow = await ctx.db
    .select({
      documentId: translatableElement.documentId,
      sortIndex: translatableElement.sortIndex,
    })
    .from(translatableElement)
    .where(eq(translatableElement.id, query.elementId))
    .limit(1);

  if (refRow.length === 0 || !refRow[0]) return [];
  const { documentId, sortIndex: refSortIndex } = refRow[0];

  // 2. Alias vectorizedString for the approved translation text
  const approvedString = aliasedTable(vectorizedString, "approvedString");

  // 3. Query approved translations from other elements in the same document,
  //    in the target language, ordered by proximity to the reference element
  const rows = await ctx.db
    .select({
      elementId: translatableElement.id,
      source: vectorizedString.value,
      translation: approvedString.value,
    })
    .from(translatableElement)
    .innerJoin(
      vectorizedString,
      eq(vectorizedString.id, translatableElement.vectorizedStringId),
    )
    .innerJoin(
      translation,
      eq(translation.id, translatableElement.approvedTranslationId),
    )
    .innerJoin(approvedString, eq(approvedString.id, translation.stringId))
    .where(
      and(
        eq(translatableElement.documentId, documentId),
        ne(translatableElement.id, query.elementId),
        eq(approvedString.languageId, query.languageId),
        isNotNull(translatableElement.approvedTranslationId),
      ),
    )
    .orderBy(
      // Proximity ordering: sortIndex distance when available, else element id distance
      refSortIndex !== null
        ? asc(sql`ABS(${translatableElement.sortIndex} - ${refSortIndex})`)
        : asc(sql`ABS(${translatableElement.id} - ${query.elementId})`),
    )
    .limit(query.maxCount);

  return rows.map((r) => ({
    source: r.source,
    translation: r.translation,
    elementId: r.elementId,
  }));
};
