import type { EvaluationReport } from "@/eval/types";
import type { RunResult } from "@/harness/harness";

export type ThresholdResult = {
  metric: string;
  actual: number;
  threshold: string;
  passed: boolean;
};

export type Report = {
  json: RunResultWithEvaluation;
  markdown: string;
  thresholdResults: ThresholdResult[];
  allPassed: boolean;
};

export type RunResultWithEvaluation = RunResult & {
  evaluation: EvaluationReport;
  thresholdResults: ThresholdResult[];
};

export const generateReport = (
  runResult: RunResult,
  evaluation: EvaluationReport,
  thresholds?: Record<string, string>,
): Report => {
  const thresholdResults: ThresholdResult[] = [];
  if (thresholds) {
    const allAggregates = new Map<string, number>();
    for (const se of evaluation.scenarioEvaluations) {
      for (const [k, v] of Object.entries(se.aggregates)) {
        allAggregates.set(k, v);
      }
    }

    for (const [metric, expr] of Object.entries(thresholds)) {
      const actual = allAggregates.get(metric);
      if (actual === undefined) {
        thresholdResults.push({
          metric,
          actual: NaN,
          threshold: expr,
          passed: false,
        });
        continue;
      }
      const passed = evaluateThreshold(actual, expr);
      thresholdResults.push({ metric, actual, threshold: expr, passed });
    }
  }

  const allPassed = thresholdResults.every((t) => t.passed);

  const lines: string[] = [];
  lines.push(`# Evaluation Report: ${runResult.suiteName}`);
  lines.push("");
  lines.push(`**Run ID:** ${runResult.runId}`);
  lines.push(`**Timestamp:** ${runResult.timestamp}`);
  lines.push(`**Duration:** ${(runResult.durationMs / 1000).toFixed(1)}s`);
  lines.push("");

  for (const se of evaluation.scenarioEvaluations) {
    const heading = se.scenarioName
      ? `${se.scenarioName} (${se.scenarioType})`
      : se.scenarioType;
    lines.push(`## ${heading} — ${se.testSetName}`);
    lines.push("");

    lines.push("| Metric | Value | Threshold | Status |");
    lines.push("|--------|-------|-----------|--------|");

    for (const [metric, value] of Object.entries(se.aggregates)) {
      const metricKeys = [
        se.scenarioName ? `${se.scenarioName}.${metric}` : undefined,
        `${se.scenarioType}.${metric}`,
        metric,
      ].filter((v): v is string => Boolean(v));
      const tr = metricKeys
        .map((key) => thresholdResults.find((entry) => entry.metric === key))
        .find((entry) => entry !== undefined);
      const thresholdStr = tr?.threshold ?? "—";
      const statusStr = tr ? (tr.passed ? "✅ PASS" : "❌ FAIL") : "ℹ️ INFO";
      const valueStr = metric.includes("latency")
        ? `${value.toFixed(0)}ms`
        : value.toFixed(4);
      lines.push(
        `| ${metric} | ${valueStr} | ${thresholdStr} | ${statusStr} |`,
      );
    }
    lines.push("");

    const okCases = se.caseEvaluations.filter((c) => c.status === "ok").length;
    const totalCases = se.caseEvaluations.length;
    lines.push(`Cases: ${okCases}/${totalCases} OK`);
    lines.push("");
  }

  if (thresholdResults.length > 0) {
    lines.push(
      `## Overall: ${allPassed ? "✅ ALL THRESHOLDS PASSED" : "❌ SOME THRESHOLDS FAILED"}`,
    );
  }

  const json: RunResultWithEvaluation = {
    ...runResult,
    evaluation,
    thresholdResults,
  };

  return {
    json,
    markdown: lines.join("\n"),
    thresholdResults,
    allPassed,
  };
};

const evaluateThreshold = (actual: number, expr: string): boolean => {
  const match = expr.match(/^(>=?|<=?|==)\s*([\d.]+)$/);
  if (!match) return false;
  const [, op, valueStr] = match;
  const threshold = Number.parseFloat(valueStr);
  switch (op) {
    case ">=":
      return actual >= threshold;
    case ">":
      return actual > threshold;
    case "<=":
      return actual <= threshold;
    case "<":
      return actual < threshold;
    case "==":
      return actual === threshold;
    default:
      return false;
  }
};
