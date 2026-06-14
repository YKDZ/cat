import { serverLogger as logger } from "@cat/server-shared";

import { placeholderize } from "./memory-template";
import { tokenizeOp } from "./tokenize";

/**
 *
 * 若当前查询的模板与候选 variant 的 sourceTemplate 严格相等，
 * 则返回置信度 1.0；否则返回 null 表示回退到 pg_trgm similarity。
 * Perform structural equality template matching for TOKEN_TEMPLATE variants.
 *
 * If the current query's template strictly equals the candidate's sourceTemplate,
 * returns confidence 1.0. Otherwise returns null to fall back to pg_trgm similarity.
 *
 * @param queryText - Current query text
 * @param candidateSourceTemplate - Candidate variant's sourceTemplate
 * @param cachedTemplate - Pre-computed current query template (optional)
 * @returns - Match result: confidence 1.0 if matched, null if not
 */
export const matchTemplateStructure = async (
  queryText: string,
  candidateSourceTemplate: string | null,
  cachedTemplate?: {
    template: string;
    slots: ReturnType<typeof placeholderize>["slots"];
  },
): Promise<{ confidence: number } | null> => {
  if (!candidateSourceTemplate) return null;

  let template: string;
  try {
    if (cachedTemplate) {
      template = cachedTemplate.template;
    } else {
      const { tokens } = await tokenizeOp({ text: queryText });
      const result = placeholderize(tokens, queryText);
      template = result.template;
    }
  } catch (err) {
    logger
      .withSituation("OP")
      .warn({ err }, "TMPL: tokenizeOp failed, falling back to pg_trgm");
    return null;
  }

  // Strict string equality comparison
  if (template === candidateSourceTemplate) {
    return { confidence: 1.0 };
  }

  return null;
};
