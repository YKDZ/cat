import { describe, expect, it } from "vitest";

import type { CaseResult } from "@/harness/types";

import { RefResolver } from "@/seeder/ref-resolver";

import { agentLatencyScorer } from "./agent-latency";
import { channelCoverageScorer } from "./channel-coverage";
import { chrfScorer } from "./chrf";
import { confidenceScorer } from "./confidence";
import { f1Scorer } from "./f1";
import { hitRateScorer } from "./hit-rate";
import { instructionAdherenceScorer } from "./instruction-adherence";
import { latencyScorer } from "./latency";
import { mrrScorer } from "./mrr";
import { negativeExclusionScorer } from "./negative-exclusion";
import { precisionScorer } from "./precision";
import { recallScorer } from "./recall";
import { termComplianceScorer } from "./term-compliance";
import { tokenCostScorer } from "./token-cost";

const makeRefs = (entries: [string, number][]): RefResolver => {
  const r = new RefResolver();
  for (const [ref, id] of entries) r.set(ref, id);
  return r;
};

const okCase = (rawOutput: unknown, durationMs = 100): CaseResult => ({
  caseId: "test",
  rawOutput,
  durationMs,
  status: "ok",
});

describe("precisionScorer", () => {
  it("computes precision@5 correctly", () => {
    const refs = makeRefs([
      ["concept:a", 1],
      ["concept:b", 2],
    ]);
    const result = precisionScorer.score({
      caseResult: okCase([
        { conceptId: 1, confidence: 0.9 },
        { conceptId: 3, confidence: 0.8 },
        { conceptId: 2, confidence: 0.7 },
      ]),
      expectedItems: [{ conceptRef: "concept:a" }, { conceptRef: "concept:b" }],
      negativeItems: [],
      refs,
      k: 5,
    });
    expect(result[0].value).toBeCloseTo(2 / 3);
  });
});

describe("recallScorer", () => {
  it("computes recall@5 correctly", () => {
    const refs = makeRefs([
      ["concept:a", 1],
      ["concept:b", 2],
      ["concept:c", 3],
    ]);
    const result = recallScorer.score({
      caseResult: okCase([{ conceptId: 1 }, { conceptId: 3 }]),
      expectedItems: [
        { conceptRef: "concept:a" },
        { conceptRef: "concept:b" },
        { conceptRef: "concept:c" },
      ],
      negativeItems: [],
      refs,
      k: 5,
    });
    expect(result[0].value).toBeCloseTo(2 / 3);
  });
});

describe("f1Scorer", () => {
  it("computes f1 as harmonic mean", () => {
    const refs = makeRefs([["concept:a", 1]]);
    const result = f1Scorer.score({
      caseResult: okCase([{ conceptId: 1 }, { conceptId: 99 }]),
      expectedItems: [{ conceptRef: "concept:a" }],
      negativeItems: [],
      refs,
      k: 2,
    });
    expect(result[0].value).toBeCloseTo(2 / 3);
  });
});

describe("mrrScorer", () => {
  it("returns reciprocal rank of first relevant", () => {
    const refs = makeRefs([["concept:a", 1]]);
    const result = mrrScorer.score({
      caseResult: okCase([
        { conceptId: 99 },
        { conceptId: 98 },
        { conceptId: 1 },
      ]),
      expectedItems: [{ conceptRef: "concept:a" }],
      negativeItems: [],
      refs,
    });
    expect(result[0].value).toBeCloseTo(1 / 3);
  });
});

describe("hitRateScorer", () => {
  it("returns 1 on hit, 0 on miss", () => {
    const refs = makeRefs([["concept:a", 1]]);
    const hit = hitRateScorer.score({
      caseResult: okCase([{ conceptId: 1 }]),
      expectedItems: [{ conceptRef: "concept:a" }],
      negativeItems: [],
      refs,
    });
    expect(hit[0].value).toBe(1);

    const miss = hitRateScorer.score({
      caseResult: okCase([{ conceptId: 99 }]),
      expectedItems: [{ conceptRef: "concept:a" }],
      negativeItems: [],
      refs,
    });
    expect(miss[0].value).toBe(0);
  });
});

describe("negativeExclusionScorer", () => {
  it("returns 0 when negative item present", () => {
    const refs = makeRefs([["concept:bad", 666]]);
    const result = negativeExclusionScorer.score({
      caseResult: okCase([{ conceptId: 666 }]),
      expectedItems: [],
      negativeItems: [{ conceptRef: "concept:bad" }],
      refs,
    });
    expect(result[0].value).toBe(0);
  });
});

describe("latencyScorer", () => {
  it("passes through durationMs", () => {
    const result = latencyScorer.score({
      caseResult: okCase([], 142),
      expectedItems: [],
      negativeItems: [],
      refs: new RefResolver(),
    });
    expect(result[0].value).toBe(142);
  });
});

describe("confidenceScorer", () => {
  it("checks minimumConfidence", () => {
    const refs = makeRefs([["concept:a", 1]]);
    const result = confidenceScorer.score({
      caseResult: okCase([{ conceptId: 1, confidence: 0.95 }]),
      expectedItems: [{ conceptRef: "concept:a", minimumConfidence: 0.9 }],
      negativeItems: [],
      refs,
    });
    expect(result[0].value).toBe(1);
  });
});

describe("channelCoverageScorer", () => {
  it("checks required channels in evidences", () => {
    const refs = makeRefs([["concept:a", 1]]);
    const result = channelCoverageScorer.score({
      caseResult: okCase([
        {
          conceptId: 1,
          evidences: [
            { channel: "lexical", confidence: 0.9 },
            { channel: "morphological", confidence: 0.7 },
          ],
        },
      ]),
      expectedItems: [
        { conceptRef: "concept:a", requiredChannels: ["lexical", "semantic"] },
      ],
      negativeItems: [],
      refs,
    });
    expect(result[0].value).toBeCloseTo(0.5);
  });
});

// ── Agent-translate scorer helpers ──────────────────────────────────────────

const makeTranslateCase = (
  translations: Array<{ elementRef: string; text: string }>,
  metrics?: {
    promptTokens?: number;
    completionTokens?: number;
    agentLatencyMs?: number;
  },
  durationMs = 100,
): CaseResult => ({
  caseId: "test",
  rawOutput: { translations, metrics: metrics ?? {} },
  durationMs,
  status: "ok",
});

const makeFailedCase = (status: "error" | "timeout" = "error"): CaseResult => ({
  caseId: "test",
  rawOutput: null,
  durationMs: 0,
  status,
});

describe("instructionAdherenceScorer", () => {
  it("returns full coverage when all elements are translated", () => {
    const result = instructionAdherenceScorer.score({
      caseResult: makeTranslateCase([
        { elementRef: "el:001", text: "钻石剑" },
        { elementRef: "el:002", text: "弓" },
      ]),
      expectedItems: [
        { elementRef: "el:001", expectedText: "钻石剑" },
        { elementRef: "el:002", expectedText: "弓" },
      ],
      negativeItems: [],
      refs: new RefResolver(),
    });
    expect(result[0].value).toBe(1);
  });

  it("returns partial coverage when some elements are missing", () => {
    const result = instructionAdherenceScorer.score({
      caseResult: makeTranslateCase([{ elementRef: "el:001", text: "钻石剑" }]),
      expectedItems: [
        { elementRef: "el:001", expectedText: "钻石剑" },
        { elementRef: "el:002", expectedText: "弓" },
        { elementRef: "el:003", expectedText: "盾牌" },
        { elementRef: "el:004", expectedText: "铁镐" },
      ],
      negativeItems: [],
      refs: new RefResolver(),
    });
    expect(result[0].value).toBeCloseTo(0.25);
  });

  it("returns 0 for a failed run", () => {
    const result = instructionAdherenceScorer.score({
      caseResult: makeFailedCase(),
      expectedItems: [{ elementRef: "el:001", expectedText: "钻石剑" }],
      negativeItems: [],
      refs: new RefResolver(),
    });
    expect(result[0].value).toBe(0);
  });

  it("returns 1 when no elements are requested", () => {
    const result = instructionAdherenceScorer.score({
      caseResult: makeTranslateCase([]),
      expectedItems: [],
      negativeItems: [],
      refs: new RefResolver(),
    });
    expect(result[0].value).toBe(1);
  });

  it("ignores extra translation rows not in expectedItems", () => {
    const result = instructionAdherenceScorer.score({
      caseResult: makeTranslateCase([
        { elementRef: "el:001", text: "钻石剑" },
        { elementRef: "el:999", text: "extra" },
      ]),
      expectedItems: [{ elementRef: "el:001", expectedText: "钻石剑" }],
      negativeItems: [],
      refs: new RefResolver(),
    });
    expect(result[0].value).toBe(1);
  });
});

describe("termComplianceScorer", () => {
  it("returns 1 when all required terms are present", () => {
    const result = termComplianceScorer.score({
      caseResult: makeTranslateCase([
        { elementRef: "el:001", text: "这是一把钻石剑，非常锋利" },
      ]),
      expectedItems: [
        {
          elementRef: "el:001",
          expectedText: "钻石剑",
          requiredTerms: ["钻石", "剑"],
        },
      ],
      negativeItems: [],
      refs: new RefResolver(),
    });
    expect(result[0].value).toBe(1);
  });

  it("returns partial score for partial compliance", () => {
    const result = termComplianceScorer.score({
      caseResult: makeTranslateCase([
        { elementRef: "el:001", text: "一把锋利的宝剑" },
      ]),
      expectedItems: [
        {
          elementRef: "el:001",
          expectedText: "钻石剑",
          requiredTerms: ["钻石", "剑"],
        },
      ],
      negativeItems: [],
      refs: new RefResolver(),
    });
    expect(result[0].value).toBe(0.5);
  });

  it("returns 0 for a failed run", () => {
    const result = termComplianceScorer.score({
      caseResult: makeFailedCase(),
      expectedItems: [
        {
          elementRef: "el:001",
          expectedText: "钻石剑",
          requiredTerms: ["钻石"],
        },
      ],
      negativeItems: [],
      refs: new RefResolver(),
    });
    expect(result[0].value).toBe(0);
  });

  it("counts missing translations as missed required terms", () => {
    const result = termComplianceScorer.score({
      caseResult: makeTranslateCase([]),
      expectedItems: [
        {
          elementRef: "el:001",
          expectedText: "钻石剑",
          requiredTerms: ["钻石", "剑"],
        },
      ],
      negativeItems: [],
      refs: new RefResolver(),
    });
    expect(result[0].value).toBe(0);
    expect(result[0].detail).toMatch(/no translation/);
  });
});

describe("chrfScorer", () => {
  it("returns 1 for identical strings", () => {
    const result = chrfScorer.score({
      caseResult: makeTranslateCase([{ elementRef: "el:001", text: "钻石剑" }]),
      expectedItems: [{ elementRef: "el:001", expectedText: "钻石剑" }],
      negativeItems: [],
      refs: new RefResolver(),
    });
    expect(result[0].value).toBeCloseTo(1);
  });

  it("returns high score for similar strings", () => {
    const result = chrfScorer.score({
      caseResult: makeTranslateCase([
        { elementRef: "el:001", text: "一把钻石制成的剑" },
      ]),
      expectedItems: [{ elementRef: "el:001", expectedText: "用钻石制成的剑" }],
      negativeItems: [],
      refs: new RefResolver(),
    });
    expect(result[0].value).toBeGreaterThan(0.5);
  });

  it("returns 0 with detail when no translations match", () => {
    const result = chrfScorer.score({
      caseResult: makeTranslateCase([]),
      expectedItems: [{ elementRef: "el:001", expectedText: "钻石剑" }],
      negativeItems: [],
      refs: new RefResolver(),
    });
    expect(result[0].value).toBe(0);
    expect(result[0].detail).toContain("no translation");
  });

  it("returns 0 for empty candidate against non-empty reference", () => {
    const result = chrfScorer.score({
      caseResult: makeTranslateCase([{ elementRef: "el:001", text: "" }]),
      expectedItems: [{ elementRef: "el:001", expectedText: "钻石剑" }],
      negativeItems: [],
      refs: new RefResolver(),
    });
    expect(result[0].value).toBe(0);
  });

  it("handles unmatched element refs gracefully", () => {
    const result = chrfScorer.score({
      caseResult: makeTranslateCase([{ elementRef: "el:999", text: "unused" }]),
      expectedItems: [{ elementRef: "el:001", expectedText: "钻石剑" }],
      negativeItems: [],
      refs: new RefResolver(),
    });
    expect(result[0].value).toBe(0);
    expect(result[0].detail).toContain("no translation");
  });
});

describe("tokenCostScorer", () => {
  it("emits prompt, completion, and total token counts", () => {
    const result = tokenCostScorer.score({
      caseResult: makeTranslateCase([], {
        promptTokens: 200,
        completionTokens: 150,
      }),
      expectedItems: [],
      negativeItems: [],
      refs: new RefResolver(),
    });
    const byName = Object.fromEntries(result.map((r) => [r.name, r.value]));
    expect(byName.prompt_tokens).toBe(200);
    expect(byName.completion_tokens).toBe(150);
    expect(byName.total_tokens).toBe(350);
  });

  it("returns zeros for a failed run", () => {
    const result = tokenCostScorer.score({
      caseResult: makeFailedCase(),
      expectedItems: [],
      negativeItems: [],
      refs: new RefResolver(),
    });
    const byName = Object.fromEntries(result.map((r) => [r.name, r.value]));
    expect(byName.total_tokens).toBe(0);
  });
});

describe("agentLatencyScorer", () => {
  it("reads agentLatencyMs from metrics", () => {
    const result = agentLatencyScorer.score({
      caseResult: makeTranslateCase([], { agentLatencyMs: 3500 }, 4000),
      expectedItems: [],
      negativeItems: [],
      refs: new RefResolver(),
    });
    expect(result[0].value).toBe(3500);
    expect(result[0].name).toBe("agent_latency_ms");
  });

  it("falls back to caseResult.durationMs when metrics are missing", () => {
    const result = agentLatencyScorer.score({
      caseResult: {
        caseId: "test",
        rawOutput: null,
        durationMs: 2000,
        status: "ok",
      },
      expectedItems: [],
      negativeItems: [],
      refs: new RefResolver(),
    });
    expect(result[0].value).toBe(2000);
  });
});
