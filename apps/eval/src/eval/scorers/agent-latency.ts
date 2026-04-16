// oxlint-disable typescript-eslint/no-unsafe-type-assertion -- rawOutput requires casting from unknown
import type { Scorer, ScorerInput, ScoreValue } from "../types";

type AgentTranslateMetrics = { agentLatencyMs?: number };
type AgentTranslateOutput = { metrics?: AgentTranslateMetrics };

/**
 * Agent-latency scorer — emits the agent's wall-clock duration in milliseconds.
 * Falls back to caseResult.durationMs when metrics are unavailable.
 * Agent 延迟评分器 — 输出 agent 的实际执行时长（毫秒）。
 */
export const agentLatencyScorer: Scorer = {
  name: "agent-latency",
  score: (input: ScorerInput): ScoreValue[] => {
    const { caseResult } = input;
    const output = caseResult.rawOutput as AgentTranslateOutput;
    const latencyMs = output?.metrics?.agentLatencyMs ?? caseResult.durationMs;
    return [{ name: "agent_latency_ms", value: latencyMs }];
  },
};
