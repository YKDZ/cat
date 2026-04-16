// oxlint-disable typescript-eslint/no-unsafe-type-assertion -- rawOutput requires casting from unknown
import type { Scorer, ScorerInput, ScoreValue } from "../types";

type AgentTranslateMetrics = {
  promptTokens?: number;
  completionTokens?: number;
};
type AgentTranslateOutput = { metrics?: AgentTranslateMetrics };

/**
 * Token-cost scorer — emits prompt, completion, and total token counts as
 * informational metrics (not a quality score).
 * 令牌费用评分器 — 输出提示词、补全和总令牌数作为信息性指标。
 */
export const tokenCostScorer: Scorer = {
  name: "token-cost",
  score: (input: ScorerInput): ScoreValue[] => {
    const { caseResult } = input;
    if (caseResult.status !== "ok") {
      return [
        { name: "prompt_tokens", value: 0 },
        { name: "completion_tokens", value: 0 },
        { name: "total_tokens", value: 0 },
      ];
    }

    const output = caseResult.rawOutput as AgentTranslateOutput;
    const metrics = output?.metrics ?? {};
    const promptTokens = metrics.promptTokens ?? 0;
    const completionTokens = metrics.completionTokens ?? 0;

    return [
      { name: "prompt_tokens", value: promptTokens },
      { name: "completion_tokens", value: completionTokens },
      { name: "total_tokens", value: promptTokens + completionTokens },
    ];
  },
};
