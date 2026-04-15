// oxlint-disable typescript-eslint/no-unsafe-type-assertion -- rawOutput requires casting from unknown
import type { Scorer, ScorerInput, ScoreValue } from "../types";

/**
 * Negative exclusion scorer — 1 if no negative items found in results, 0 otherwise.
 * 负例排除评分器 — 负例未出现在结果中则为 1。
 */
export const negativeExclusionScorer: Scorer = {
  name: "negative-exclusion",
  score: (input: ScorerInput): ScoreValue[] => {
    const { caseResult, negativeItems, refs } = input;
    if (caseResult.status !== "ok" || !Array.isArray(caseResult.rawOutput)) {
      return [
        { name: "negative-exclusion", value: 1, detail: "no results to check" },
      ];
    }

    const results = caseResult.rawOutput as Array<{
      conceptId?: number;
      id?: number;
    }>;
    const resultIds = new Set<number | string | undefined>(
      results.map((r) => r.conceptId ?? r.id),
    );
    const negativeIds = (
      negativeItems as Array<{ conceptRef?: string; memoryItemRef?: string }>
    )
      .map((e) => {
        const ref = e.conceptRef ?? e.memoryItemRef;
        return ref ? refs.getId(ref) : undefined;
      })
      .filter((id) => id !== undefined);

    if (negativeIds.length === 0)
      return [{ name: "negative-exclusion", value: 1 }];

    const leaked = negativeIds.filter((id) => resultIds.has(id));
    return [
      {
        name: "negative-exclusion",
        value: leaked.length === 0 ? 1 : 0,
        detail:
          leaked.length > 0 ? `leaked IDs: ${leaked.join(", ")}` : undefined,
      },
    ];
  },
};
