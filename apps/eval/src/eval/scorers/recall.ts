// oxlint-disable typescript-eslint/no-unsafe-type-assertion -- rawOutput requires casting from unknown
import type { Scorer, ScorerInput, ScoreValue } from "../types";

/**
 * Recall@K scorer for recall scenarios.
 * 计算预期条目在 top-K 结果中的找回率。
 */
export const recallScorer: Scorer = {
  name: "recall",
  score: (input: ScorerInput): ScoreValue[] => {
    const { caseResult, expectedItems, refs, k = 5 } = input;
    if (caseResult.status !== "ok" || !Array.isArray(caseResult.rawOutput)) {
      return [
        {
          name: `recall@${k}`,
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
    const topKIds = new Set<number | string | undefined>(
      topK.map((r) => r.conceptId ?? r.id),
    );

    const expected = (
      expectedItems as Array<{ conceptRef?: string; memoryItemRef?: string }>
    )
      .map((e) => {
        const ref = e.conceptRef ?? e.memoryItemRef;
        return ref ? refs.getId(ref) : undefined;
      })
      .filter((id) => id !== undefined);

    if (expected.length === 0) return [{ name: `recall@${k}`, value: 1 }];

    const found = expected.filter((id) => topKIds.has(id)).length;
    return [{ name: `recall@${k}`, value: found / expected.length }];
  },
};
