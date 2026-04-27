import type {
  TermRecallTestSet,
  MemoryRecallTestSet,
  TranslationTestSet,
  TermRecallTestCase,
  MemoryRecallTestCase,
  TranslationTestCase,
} from "@/config/schemas";
import type { ScenarioResult } from "@/harness/types";
import type { RefResolver } from "@/seeder/ref-resolver";

import type {
  CaseEvaluation,
  EvaluationReport,
  ScenarioEvaluation,
  ScoreValue,
} from "./types";

import { getScorer } from "./scorers";

export const evaluate = (
  scenarioResults: ScenarioResult[],
  testSets: Map<
    string,
    TermRecallTestSet | MemoryRecallTestSet | TranslationTestSet
  >,
  scorerNames: string[][],
  refs: RefResolver,
): EvaluationReport => {
  const scenarioEvaluations: ScenarioEvaluation[] = [];

  for (let i = 0; i < scenarioResults.length; i += 1) {
    const sr = scenarioResults[i];
    const names = scorerNames[i] ?? [];
    const scorers = names.map(getScorer);

    const testSet =
      [...testSets.values()].find(
        (ts) =>
          ts.name === sr.testSetName.replace(/.*\//, "").replace(/\.yaml$/, ""),
      ) ?? [...testSets.values()][i];

    const caseEvaluations: CaseEvaluation[] = [];

    for (const caseResult of sr.cases) {
      const testCase = findTestCase(testSet, caseResult.caseId);
      const expectedItems = getExpectedItems(testCase);
      const negativeItems = getNegativeItems(testCase);

      const scores: ScoreValue[] = [];
      for (const scorer of scorers) {
        scores.push(
          ...scorer.score({ caseResult, expectedItems, negativeItems, refs }),
        );
      }

      caseEvaluations.push({
        caseId: caseResult.caseId,
        status: caseResult.status,
        scores,
        durationMs: caseResult.durationMs,
      });
    }

    const aggregates = computeAggregates(caseEvaluations);

    scenarioEvaluations.push({
      scenarioType: sr.scenarioType,
      scenarioName: sr.scenarioName,
      testSetName: sr.testSetName,
      caseEvaluations,
      aggregates,
    });
  }

  return { scenarioEvaluations };
};

const findTestCase = (
  testSet:
    | TermRecallTestSet
    | MemoryRecallTestSet
    | TranslationTestSet
    | undefined,
  caseId: string,
):
  | TermRecallTestCase
  | MemoryRecallTestCase
  | TranslationTestCase
  | undefined => testSet?.cases.find((c) => c.id === caseId);

const getExpectedItems = (
  tc:
    | TermRecallTestCase
    | MemoryRecallTestCase
    | TranslationTestCase
    | undefined,
): unknown[] => {
  if (!tc) return [];
  if ("expectedTerms" in tc) return tc.expectedTerms;
  if ("expectedMemories" in tc) return tc.expectedMemories;
  if ("referenceTranslations" in tc) return tc.referenceTranslations;
  return [];
};

const getNegativeItems = (
  tc:
    | TermRecallTestCase
    | MemoryRecallTestCase
    | TranslationTestCase
    | undefined,
): unknown[] => {
  if (!tc) return [];
  if ("negativeTerms" in tc) return tc.negativeTerms;
  if ("negativeMemories" in tc) return tc.negativeMemories;
  return [];
};

const computeAggregates = (cases: CaseEvaluation[]): Record<string, number> => {
  const agg: Record<string, number[]> = {};

  for (const c of cases) {
    if (c.status !== "ok") continue;
    for (const s of c.scores) {
      (agg[s.name] ??= []).push(s.value);
    }
  }

  const result: Record<string, number> = {};
  for (const [name, values] of Object.entries(agg)) {
    // Handle percentile suffixes: scorerName.p50, scorerName.p90, etc.
    const pctMatch = name.match(/^(.+)\.(p\d+)$/);
    if (pctMatch) {
      const [, , pctSuffix] = pctMatch;
      const p = parseInt(pctSuffix.slice(1)) / 100;
      const sorted = [...values].sort((a, b) => a - b);
      result[name] = percentile(sorted, p);
      continue;
    }
    if (name === "latency_ms" || name === "agent_latency_ms") {
      const sorted = [...values].sort((a, b) => a - b);
      const prefix = name === "agent_latency_ms" ? "agent_" : "";
      result[`${prefix}p50_latency_ms`] = percentile(sorted, 0.5);
      result[`${prefix}p95_latency_ms`] = percentile(sorted, 0.95);
      result[`${prefix}p99_latency_ms`] = percentile(sorted, 0.99);
    } else {
      result[name] = values.reduce((a, b) => a + b, 0) / values.length;
    }
  }
  return result;
};

const percentile = (sorted: number[], p: number): number => {
  if (sorted.length === 0) return 0;
  const index = Math.ceil(p * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(index, sorted.length - 1))];
};
