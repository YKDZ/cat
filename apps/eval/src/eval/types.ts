import type { CaseResult } from "@/harness/types";
import type { RefResolver } from "@/seeder/ref-resolver";

export type ScorerInput = {
  caseResult: CaseResult;
  expectedItems: unknown[];
  negativeItems: unknown[];
  refs: RefResolver;
  k?: number;
};

export type ScoreValue = {
  name: string;
  value: number;
  detail?: string;
};

export type Scorer = {
  name: string;
  score: (input: ScorerInput) => ScoreValue[];
};

export type CaseEvaluation = {
  caseId: string;
  status: string;
  scores: ScoreValue[];
  durationMs: number;
};

export type ScenarioEvaluation = {
  scenarioType: string;
  testSetName: string;
  caseEvaluations: CaseEvaluation[];
  aggregates: Record<string, number>;
};

export type EvaluationReport = {
  scenarioEvaluations: ScenarioEvaluation[];
};
