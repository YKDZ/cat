import type { Scorer, ScorerInput, ScoreValue } from "../types";

/**
 * @zh BM25 置信度评分器：返回每个 case 中 BM25 通道的最高置信度。
 * @en BM25 confidence scorer: returns the highest BM25 channel confidence per case.
 */
export const bm25ConfidenceScorer: Scorer = {
  name: "bm25-confidence",
  score: (input: ScorerInput): ScoreValue[] => {
    const { caseResult } = input;
    if (caseResult.status !== "ok" || !Array.isArray(caseResult.rawOutput)) {
      return [{ name: "bm25-confidence", value: 0 }];
    }

    /* eslint-disable @typescript-eslint/no-unsafe-type-assertion */
    const results = caseResult.rawOutput as Array<{
      evidences?: Array<{ channel: string; confidence: number }>;
    }>;
    /* eslint-enable @typescript-eslint/no-unsafe-type-assertion */

    let maxBm25 = 0;
    for (const r of results) {
      for (const ev of r.evidences ?? []) {
        if (ev.channel === "bm25" && ev.confidence > maxBm25) {
          maxBm25 = ev.confidence;
        }
      }
    }

    return [{ name: "bm25-confidence", value: maxBm25 }];
  },
};
