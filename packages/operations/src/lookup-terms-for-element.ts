import type { OperationContext } from "@cat/domain";
import type { TermData } from "@cat/shared/schema/misc";

import { getDbHandle } from "@cat/domain";
import {
  executeQuery,
  getElementWithChunkIds,
  listProjectGlossaryIds,
} from "@cat/domain";

import { collectTermRecallOp } from "./collect-term-recall";

/**
 * @zh 根据 elementId 从后端自动查找相关术语。
 *
 * 复用 glossary.findTerm 路由中的查询链：
 * element → document → project → glossaryIds → lexical term query。
 * 使用 ILIKE + word_similarity 进行术语匹配（不含语义搜索）。
 * @en Look up relevant terms for a translatable element from the backend.
 *
 * Reuses the query chain from the glossary.findTerm route:
 * element → document → project → glossaryIds → lexical term query.
 * Uses ILIKE + word_similarity for term matching (no semantic search).
 *
 * @param elementId - {@zh 可翻译元素 ID} {@en Translatable element ID}
 * @param translationLanguageId - {@zh 目标语言 ID} {@en Target language ID}
 * @param _ctx - {@zh 操作上下文（未使用）} {@en Operation context (unused)}
 * @returns - {@zh 匹配到的术语数据列表} {@en List of matched term data entries}
 */
export const lookupTermsForElementOp = async (
  elementId: number,
  translationLanguageId: string,
  _ctx?: OperationContext,
): Promise<TermData[]> => {
  const { client: drizzle } = await getDbHandle();

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

  const results = await collectTermRecallOp(
    {
      glossaryIds,
      text: element.value,
      sourceLanguageId: element.languageId,
      translationLanguageId,
      maxAmount: 20,
    },
    _ctx,
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
