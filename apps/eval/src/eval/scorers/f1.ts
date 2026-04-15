import type { Scorer, ScorerInput, ScoreValue } from "../types";

import { precisionScorer } from "./precision";
import { recallScorer } from "./recall";

/**
 * F1@K scorer — harmonic mean of precision and recall.
 * F1@K 评分器 — 精确率与召回率的调和平均值。
 */
export const f1Scorer: Scorer = {
  name: "f1",
  score: (input: ScorerInput): ScoreValue[] => {
    const k = input.k ?? 5;
    const pScores = precisionScorer.score(input);
    const rScores = recallScorer.score(input);
    const p = pScores[0]?.value ?? 0;
    const r = rScores[0]?.value ?? 0;
    const f1 = p + r > 0 ? (2 * p * r) / (p + r) : 0;
    return [{ name: `f1@${k}`, value: f1 }];
  },
};
