import { describe, expect, it } from "vitest";

import type { EvaluationReport } from "@/eval/types";
import type { RunResult } from "@/harness/harness";

import { RefResolver } from "@/seeder/ref-resolver";

import { generateReport } from "./reporter";

describe("generateReport", () => {
  const runResult: RunResult = {
    runId: "test-run",
    suiteName: "test-suite",
    timestamp: "2026-01-01T00:00:00Z",
    durationMs: 5000,
    scenarioResults: [],
    refs: new RefResolver(),
  };

  const evaluation: EvaluationReport = {
    scenarioEvaluations: [
      {
        scenarioType: "term-recall",
        testSetName: "test-terms",
        caseEvaluations: [],
        aggregates: {
          "precision@5": 0.92,
          "recall@5": 0.88,
          p95_latency_ms: 142,
        },
      },
    ],
  };

  it("passes thresholds correctly", () => {
    const report = generateReport(runResult, evaluation, {
      "precision@5": ">= 0.85",
      "recall@5": ">= 0.80",
      p95_latency_ms: "<= 200",
    });
    expect(report.allPassed).toBe(true);
    expect(report.thresholdResults).toHaveLength(3);
    expect(report.thresholdResults.every((t) => t.passed)).toBe(true);
  });

  it("fails thresholds correctly", () => {
    const report = generateReport(runResult, evaluation, {
      "precision@5": ">= 0.95",
    });
    expect(report.allPassed).toBe(false);
  });

  it("generates markdown with tables", () => {
    const report = generateReport(runResult, evaluation);
    expect(report.markdown).toContain("term-recall");
    expect(report.markdown).toContain("precision@5");
  });
});
