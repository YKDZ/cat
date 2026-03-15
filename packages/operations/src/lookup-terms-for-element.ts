import type { OperationContext } from "@cat/domain";
import type { TermData } from "@cat/shared/schema/misc";

import { getDrizzleDB } from "@cat/db";
import {
  executeQuery,
  getElementWithChunkIds,
  listLexicalTermSuggestions,
  listProjectGlossaryIds,
} from "@cat/domain";

/**
 * 根据 elementId 从后端自动查找相关术语
 *
 * 复用 glossary.findTerm 路由中的查询链：
 * element → document → project → glossaryIds → lexical term query
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
  const element = await executeQuery({ db: drizzle }, getElementWithChunkIds, {
    elementId,
  });

  if (element === null) {
    return [];
  }

  // 2. 查询 glossaryIds
  const glossaryIds = await executeQuery(
    { db: drizzle },
    listProjectGlossaryIds,
    { projectId: element.projectId },
  );

  if (glossaryIds.length === 0) return [];

  // 4. 直接执行 lexical term query（ILIKE + word_similarity）
  const results = await executeQuery(
    { db: drizzle },
    listLexicalTermSuggestions,
    {
      glossaryIds,
      text: element.value,
      sourceLanguageId: element.languageId,
      translationLanguageId,
      wordSimilarityThreshold: 0.3,
    },
  );

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
