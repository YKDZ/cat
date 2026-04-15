// oxlint-disable typescript-eslint/no-unsafe-type-assertion -- rawOutput requires casting from unknown
import type { Scorer, ScorerInput, ScoreValue } from "../types";

/**
 * Precision@K scorer for recall scenarios.
 * 计算 top-K 结果中相关条目占比。
 */
export const precisionScorer: Scorer = {
  name: "precision",
  score: (input: ScorerInput): ScoreValue[] => {
    const { caseResult, expectedItems, refs, k = 5 } = input;
    if (caseResult.status !== "ok" || !Array.isArray(caseResult.rawOutput)) {
      return [
        {
          name: `precision@${k}`,
          value: 0,
          detail: `case status: ${caseResult.status}`,
        },
      ];
    }

    const results = caseResult.rawOutput as Array<{
      conceptId?: number;
      id?: number;
    }>;
    const topK = results.slice(0, k);
    const expectedIds = new Set(
      (expectedItems as Array<{ conceptRef?: string; memoryItemRef?: string }>)
        .map((e) => {
          const ref = e.conceptRef ?? e.memoryItemRef;
          return ref ? refs.getId(ref) : undefined;
        })
        .filter((id) => id !== undefined),
    );

    const relevant = topK.filter((r) => {
      const id = r.conceptId ?? r.id;
      return id !== undefined && expectedIds.has(id);
    }).length;

    const precision = topK.length > 0 ? relevant / topK.length : 0;
    return [{ name: `precision@${k}`, value: precision }];
  },
};
