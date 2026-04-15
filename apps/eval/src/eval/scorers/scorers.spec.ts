import { describe, expect, it } from "vitest";

import type { CaseResult } from "@/harness/types";

import { RefResolver } from "@/seeder/ref-resolver";

import { channelCoverageScorer } from "./channel-coverage";
import { confidenceScorer } from "./confidence";
import { f1Scorer } from "./f1";
import { hitRateScorer } from "./hit-rate";
import { latencyScorer } from "./latency";
import { mrrScorer } from "./mrr";
import { negativeExclusionScorer } from "./negative-exclusion";
import { precisionScorer } from "./precision";
import { recallScorer } from "./recall";

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
