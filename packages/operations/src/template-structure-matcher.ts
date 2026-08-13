import { placeholderize } from "./memory-template.ts";
import { tokenizeOp } from "./tokenize.ts";

/**
 *
 * Perform structural equality template matching for TOKEN_TEMPLATE variants.
 *
 * If the current query's template strictly equals the candidate's sourceTemplate,
 * returns confidence 1.0. Otherwise returns null.
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

  const template = cachedTemplate
    ? cachedTemplate.template
    : placeholderize((await tokenizeOp({ text: queryText })).tokens, queryText)
        .template;

  // Strict string equality comparison
  if (template === candidateSourceTemplate) {
    return { confidence: 1.0 };
  }

  return null;
};
