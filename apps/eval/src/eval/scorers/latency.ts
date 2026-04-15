import type { Scorer, ScorerInput, ScoreValue } from "../types";

/**
 * Latency scorer — passes through durationMs from the case result.
 * 延迟评分器 — 传递每个用例的执行时长。
 */
export const latencyScorer: Scorer = {
  name: "latency",
  score: (input: ScorerInput): ScoreValue[] => {
    return [{ name: "latency_ms", value: input.caseResult.durationMs }];
  },
};
