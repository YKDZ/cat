import type { Scorer, ScorerInput, ScoreValue } from "../types";

export const selfExclusionRateScorer: Scorer = {
  name: "self-exclusion-rate",
  score: (input: ScorerInput): ScoreValue[] => {
    const { caseResult, negativeItems, refs } = input;
    if (caseResult.status !== "ok" || !Array.isArray(caseResult.rawOutput)) {
      return [{ name: "self-exclusion-rate", value: 1 }];
    }

    /* eslint-disable @typescript-eslint/no-unsafe-type-assertion */
    const results = caseResult.rawOutput as Array<{
      id?: number;
    }>;
    /* eslint-enable @typescript-eslint/no-unsafe-type-assertion */
    const resultIds = new Set(
      results.map((r) => r.id).filter((id): id is number => id !== undefined),
    );

    /* eslint-disable @typescript-eslint/no-unsafe-type-assertion */
    const negativeIds = (negativeItems as Array<{ memoryItemRef?: string }>)
      .map((n) => (n.memoryItemRef ? refs.getId(n.memoryItemRef) : undefined))
      .filter((id): id is number => id !== undefined);
    /* eslint-enable @typescript-eslint/no-unsafe-type-assertion */

    if (negativeIds.length === 0) {
      return [{ name: "self-exclusion-rate", value: 1 }];
    }

    const leaked = negativeIds.filter((id) => resultIds.has(id));
    return [
      {
        name: "self-exclusion-rate",
        value: leaked.length === 0 ? 1 : 0,
        detail:
          leaked.length > 0 ? `leaked: ${leaked.join(", ")}` : "all excluded",
      },
    ];
  },
};
