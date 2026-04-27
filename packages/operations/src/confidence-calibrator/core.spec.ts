import type { RecallEvidence } from "@cat/shared";

import { describe, it, expect } from "vitest";

import { calibrateBm25Confidence } from "./core";

const makeBm25Evidence = (
  confidence: number,
  note?: string,
): RecallEvidence => ({
  channel: "bm25",
  matchedText: "test",
  confidence,
  note: note ?? "bm25",
});

const makeSparseEvidence = (confidence: number): RecallEvidence => ({
  channel: "sparse",
  matchedText: "test",
  confidence,
});

const makeSemanticEvidence = (confidence: number): RecallEvidence => ({
  channel: "semantic",
  matchedText: "test",
  confidence,
});

describe("CAL core: calibrateBm25Confidence", () => {
  it("single BM25 result: normalized factor = 1.0, confidence = min(raw/maxRaw * 2.5, 0.85)", () => {
    const input: RecallEvidence[][] = [[makeBm25Evidence(0.5)]];
    const { calibrated, summary } = calibrateBm25Confidence(input);
    expect(summary.bm25Count).toBe(1);
    expect(summary.maxRaw).toBe(0.5);
    // 0.5 / 0.5 = 1.0 * 2.5 = 2.5, capped at 0.85
    expect(calibrated[0][0].confidence).toBe(0.85);
  });

  it("multiple BM25 results: verify normalization", () => {
    const input: RecallEvidence[][] = [
      [makeBm25Evidence(0.8)],
      [makeBm25Evidence(0.4)],
      [makeBm25Evidence(0.2)],
    ];
    const { calibrated, summary } = calibrateBm25Confidence(input);
    expect(summary.maxRaw).toBe(0.8);
    // 0.8 / 0.8 = 1.0 * 2.5 = 2.5, capped at 0.85
    expect(calibrated[0][0].confidence).toBe(0.85);
    // 0.4 / 0.8 = 0.5 * 2.5 = 1.25, capped at 0.85
    expect(calibrated[1][0].confidence).toBe(0.85);
    // 0.2 / 0.8 = 0.25 * 2.5 = 0.625
    expect(calibrated[2][0].confidence).toBeCloseTo(0.625);
  });

  it("no BM25 evidences: returns unchanged", () => {
    const input: RecallEvidence[][] = [
      [makeSemanticEvidence(0.9)],
      [makeSparseEvidence(0.5)],
    ];
    const { calibrated, summary } = calibrateBm25Confidence(input);
    expect(summary.bm25Count).toBe(0);
    expect(calibrated).toBe(input); // Same reference
  });

  it("maxRaw = 0 or NaN: fallback to unchanged", () => {
    const input: RecallEvidence[][] = [[makeBm25Evidence(0)]];
    const { calibrated, summary } = calibrateBm25Confidence(input);
    expect(summary.bm25Count).toBe(1);
    expect(summary.maxRaw).toBe(0);
    expect(calibrated).toBe(input); // Same reference

    const nanInput: RecallEvidence[][] = [[makeBm25Evidence(NaN)]];
    const { calibrated: nanCal, summary: nanSummary } =
      calibrateBm25Confidence(nanInput);
    expect(nanSummary.maxRaw).toBe(NaN);
    expect(nanCal).toBe(nanInput); // Same reference
  });

  it("sparse >= 0.5: multi-evidence appended", () => {
    const input: RecallEvidence[][] = [
      [makeBm25Evidence(0.5), makeSparseEvidence(0.6)],
    ];
    const { calibrated, summary } = calibrateBm25Confidence(input);
    expect(summary.multiEvidenceCount).toBe(1);
    // Check multi channel was appended
    const multiEv = calibrated[0].find((e) => e.channel === "multi");
    expect(multiEv).toBeDefined();
    expect(multiEv!.note).toBe("bm25+sparse multi-evidence");
  });

  it("sparse < 0.5: no multi-evidence appended", () => {
    const input: RecallEvidence[][] = [
      [makeBm25Evidence(0.5), makeSparseEvidence(0.3)],
    ];
    const { calibrated, summary } = calibrateBm25Confidence(input);
    expect(summary.multiEvidenceCount).toBe(0);
    const multiEv = calibrated[0].find((e) => e.channel === "multi");
    expect(multiEv).toBeUndefined();
  });

  it("confidence cap at 0.85", () => {
    const input: RecallEvidence[][] = [
      [makeBm25Evidence(0.9)],
      [makeBm25Evidence(0.8)],
    ];
    const { calibrated } = calibrateBm25Confidence(input);
    // Both should cap at 0.85
    expect(calibrated[0][0].confidence).toBeLessThanOrEqual(0.85);
    expect(calibrated[1][0].confidence).toBeLessThanOrEqual(0.85);
  });

  it("low raw scores get proportional calibration", () => {
    const input: RecallEvidence[][] = [[makeBm25Evidence(0.01)]];
    const { calibrated } = calibrateBm25Confidence(input);
    // 0.01 / 0.01 = 1.0 * 2.5 = 2.5, capped at 0.85
    expect(calibrated[0][0].confidence).toBe(0.85);

    // With maxRaw=0.5 and raw=0.01: 0.01/0.5=0.02 * 2.5 = 0.05
    const input2: RecallEvidence[][] = [
      [makeBm25Evidence(0.5)],
      [makeBm25Evidence(0.01)],
    ];
    const { calibrated: cal2 } = calibrateBm25Confidence(input2);
    expect(cal2[0][0].confidence).toBe(0.85);
    expect(cal2[1][0].confidence).toBeCloseTo(0.05);
  });
});
