import type { Scorer, ScorerInput, ScoreValue } from "../types";

/**
 * @zh 噪音率评分器：语义通道命中中被标记为噪音的比例。
 * @en Noise rate scorer: fraction of semantic-channel hits that are noise.
 */
export const noiseRateScorer: Scorer = {
  name: "noise-rate",
  score: (input: ScorerInput): ScoreValue[] => {
    const { caseResult, negativeItems, refs } = input;
    if (caseResult.status !== "ok" || !Array.isArray(caseResult.rawOutput)) {
      return [{ name: "noise-rate", value: 0 }];
    }

    /* eslint-disable @typescript-eslint/no-unsafe-type-assertion */
    const results = caseResult.rawOutput as Array<{
      id?: number;
      evidences?: Array<{ channel: string }>;
    }>;
    /* eslint-enable @typescript-eslint/no-unsafe-type-assertion */

    // Count semantic-channel hits
    const semanticHits = results.filter((r) =>
      r.evidences?.some((e) => e.channel === "semantic"),
    );

    if (semanticHits.length === 0) {
      return [{ name: "noise-rate", value: 0, detail: "no semantic hits" }];
    }

    // Count which of these are in negativeItems
    /* eslint-disable @typescript-eslint/no-unsafe-type-assertion */
    const negativeIds = new Set(
      (negativeItems as Array<{ memoryItemRef?: string }>)
        .map((n) => {
          const id = n.memoryItemRef ? refs.getId(n.memoryItemRef) : undefined;
          return id;
        })
        .filter((id): id is number => id !== undefined),
    );
    /* eslint-enable @typescript-eslint/no-unsafe-type-assertion */

    const noiseCount = semanticHits.filter(
      (r) => r.id !== undefined && negativeIds.has(r.id),
    ).length;

    return [
      {
        name: "noise-rate",
        value: noiseCount / semanticHits.length,
        detail: `${noiseCount}/${semanticHits.length} semantic hits are noise`,
      },
    ];
  },
};
