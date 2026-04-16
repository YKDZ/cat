// oxlint-disable typescript-eslint/no-unsafe-type-assertion -- rawOutput requires casting from unknown
import type { Scorer, ScorerInput, ScoreValue } from "../types";

const MAX_VIOLATIONS = 10;

type Translation = { elementRef: string; text: string };
type AgentTranslateOutput = { translations?: Translation[] };

/**
 * Term-compliance scorer — checks that required glossary terms appear in each
 * translated element.
 * 术语合规评分器 — 检查每个翻译元素中是否出现了必需的术语。
 */
export const termComplianceScorer: Scorer = {
  name: "term-compliance",
  score: (input: ScorerInput): ScoreValue[] => {
    const { caseResult, expectedItems } = input;
    if (caseResult.status !== "ok") {
      return [
        {
          name: "term-compliance",
          value: 0,
          detail: `case status: ${caseResult.status}`,
        },
      ];
    }

    const output = caseResult.rawOutput as AgentTranslateOutput;
    const translationMap = new Map<string, string>(
      (output?.translations ?? []).map((t) => [t.elementRef, t.text]),
    );

    let totalRequired = 0;
    let totalFound = 0;
    const violations: string[] = [];

    for (const item of expectedItems as Array<{
      elementRef?: string;
      requiredTerms?: string[];
    }>) {
      const terms = item.requiredTerms ?? [];
      if (terms.length === 0) continue;

      const translationText = item.elementRef
        ? translationMap.get(item.elementRef)
        : undefined;

      for (const term of terms) {
        totalRequired += 1;
        if (translationText !== undefined && translationText.includes(term)) {
          totalFound += 1;
        } else if (violations.length < MAX_VIOLATIONS) {
          const reason =
            translationText !== undefined
              ? `"${term}" not found in translation for ${item.elementRef}`
              : `no translation for ${item.elementRef} (missing term: "${term}")`;
          violations.push(reason);
        }
      }
    }

    if (totalRequired === 0) {
      return [{ name: "term-compliance", value: 1 }];
    }

    const result: ScoreValue = {
      name: "term-compliance",
      value: totalFound / totalRequired,
    };
    if (violations.length > 0) {
      result.detail = violations.join("; ");
    }
    return [result];
  },
};
