// oxlint-disable typescript-eslint/no-unsafe-type-assertion -- rawOutput requires casting from unknown
import type { Scorer, ScorerInput, ScoreValue } from "../types";

type Translation = { elementRef: string };
type AgentTranslateOutput = { translations?: Translation[] };

/**
 * Instruction-adherence scorer — measures what fraction of requested elements
 * were actually translated by the agent.
 * 指令遵从评分器 — 衡量 agent 实际翻译的元素占请求总数的比例。
 */
export const instructionAdherenceScorer: Scorer = {
  name: "instruction-adherence",
  score: (input: ScorerInput): ScoreValue[] => {
    const { caseResult, expectedItems } = input;
    if (caseResult.status !== "ok") {
      return [
        {
          name: "instruction-adherence",
          value: 0,
          detail: `case status: ${caseResult.status}`,
        },
      ];
    }

    const requestedRefs = (expectedItems as Array<{ elementRef?: string }>)
      .map((e) => e.elementRef)
      .filter((r): r is string => r !== undefined);

    if (requestedRefs.length === 0) {
      return [{ name: "instruction-adherence", value: 1 }];
    }

    const output = caseResult.rawOutput as AgentTranslateOutput;
    const translatedRefs = new Set(
      (output?.translations ?? []).map((t) => t.elementRef),
    );

    const translated = requestedRefs.filter((r) =>
      translatedRefs.has(r),
    ).length;

    return [
      {
        name: "instruction-adherence",
        value: translated / requestedRefs.length,
      },
    ];
  },
};
