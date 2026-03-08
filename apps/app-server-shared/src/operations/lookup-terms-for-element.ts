import type { TermData } from "@cat/shared/schema/misc";

import {
  eq,
  getDrizzleDB,
  glossaryToProject,
  document as documentTable,
  translatableElement,
  translatableString,
} from "@cat/db";
import { assertSingleNonNullish } from "@cat/shared/utils";

import type { OperationContext } from "@/operations/types";

import { lookupTermsOp } from "./lookup-terms";

/**
 * 根据 elementId 从后端自动查找相关术语
 *
 * 复用 glossary.findTerm 路由中的查询链：
 * element → document → project → glossaryIds → lookupTermsOp
 *
 * 使用 ILIKE + word_similarity 进行术语匹配（不含语义搜索）
 */
export const lookupTermsForElementOp = async (
  elementId: number,
  translationLanguageId: string,
  _ctx?: OperationContext,
): Promise<TermData[]> => {
  const { client: drizzle } = await getDrizzleDB();

  // 1. 查询 element 获取原文文本和源语言 ID
  const element = assertSingleNonNullish(
    await drizzle
      .select({
        value: translatableString.value,
        languageId: translatableString.languageId,
        documentId: translatableElement.documentId,
      })
      .from(translatableElement)
      .innerJoin(
        translatableString,
        eq(translatableElement.translatableStringId, translatableString.id),
      )
      .where(eq(translatableElement.id, elementId))
      .limit(1),
  );

  // 2. 查询 project ID
  const { projectId } = assertSingleNonNullish(
    await drizzle
      .select({ projectId: documentTable.projectId })
      .from(documentTable)
      .where(eq(documentTable.id, element.documentId))
      .limit(1),
  );

  // 3. 查询 glossaryIds
  const glossaryIds = (
    await drizzle
      .select({ id: glossaryToProject.glossaryId })
      .from(glossaryToProject)
      .where(eq(glossaryToProject.projectId, projectId))
  ).map((row) => row.id);

  if (glossaryIds.length === 0) return [];

  // 4. 调用 lookupTermsOp（ILIKE + word_similarity）
  const results = await lookupTermsOp({
    glossaryIds,
    text: element.value,
    sourceLanguageId: element.languageId,
    translationLanguageId,
  });

  // 5. 转换为 TermData[]
  return results.map((r) => ({
    term: r.term,
    termLanguageId: element.languageId,
    translation: r.translation,
    translationLanguageId,
    definition: r.definition ?? null,
    conceptId: r.conceptId ?? null,
    glossaryId: r.glossaryId ?? null,
  }));
};
