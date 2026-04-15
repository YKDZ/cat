// oxlint-disable typescript-eslint/no-unsafe-type-assertion -- rawOutput requires casting from unknown
import type { Scorer, ScorerInput, ScoreValue } from "../types";

/**
 * MRR scorer — reciprocal rank of the first relevant result.
 * MRR 评分器 — 第一个相关结果排名的倒数。
 */
export const mrrScorer: Scorer = {
  name: "mrr",
  score: (input: ScorerInput): ScoreValue[] => {
    const { caseResult, expectedItems, refs } = input;
    if (caseResult.status !== "ok" || !Array.isArray(caseResult.rawOutput)) {
      return [
        { name: "mrr", value: 0, detail: `case status: ${caseResult.status}` },
      ];
    }

    const results = caseResult.rawOutput as Array<{
      conceptId?: number;
      id?: number;
    }>;
    const expectedIds = new Set(
      (expectedItems as Array<{ conceptRef?: string; memoryItemRef?: string }>)
        .map((e) => {
          const ref = e.conceptRef ?? e.memoryItemRef;
          return ref ? refs.getId(ref) : undefined;
        })
        .filter((id) => id !== undefined),
    );

    for (let i = 0; i < results.length; i += 1) {
      const id = results[i].conceptId ?? results[i].id;
      if (id !== undefined && expectedIds.has(id)) {
        return [{ name: "mrr", value: 1 / (i + 1) }];
      }
    }
    return [{ name: "mrr", value: 0 }];
  },
};
