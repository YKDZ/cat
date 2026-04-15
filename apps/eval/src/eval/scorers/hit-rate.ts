// oxlint-disable typescript-eslint/no-unsafe-type-assertion -- rawOutput requires casting from unknown
import type { Scorer, ScorerInput, ScoreValue } from "../types";

/**
 * Hit rate scorer — 1 if any expected item found in results, 0 otherwise.
 * 命中率评分器 — 只要结果中有任一期望条目即为 1。
 */
export const hitRateScorer: Scorer = {
  name: "hit-rate",
  score: (input: ScorerInput): ScoreValue[] => {
    const { caseResult, expectedItems, refs } = input;
    if (caseResult.status !== "ok" || !Array.isArray(caseResult.rawOutput)) {
      return [{ name: "hit-rate", value: 0 }];
    }

    const results = caseResult.rawOutput as Array<{
      conceptId?: number;
      id?: number;
    }>;
    const resultIds = new Set<number | string | undefined>(
      results.map((r) => r.conceptId ?? r.id),
    );
    const expectedIds = (
      expectedItems as Array<{ conceptRef?: string; memoryItemRef?: string }>
    )
      .map((e) => {
        const ref = e.conceptRef ?? e.memoryItemRef;
        return ref ? refs.getId(ref) : undefined;
      })
      .filter((id) => id !== undefined);

    const hit = expectedIds.some((id) => resultIds.has(id));
    return [{ name: "hit-rate", value: hit ? 1 : 0 }];
  },
};
