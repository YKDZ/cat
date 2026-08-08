import type { DrizzleDB } from "@cat/db";
import type { PluginManager } from "@cat/plugin-core";
import type { CandidateRecallResult, RecallEvidence } from "@cat/shared";

import type { ScenarioConfig } from "#/config/schemas.ts";
import type { RefResolver } from "#/seeder/ref-resolver.ts";

export type HarnessContext = {
  pluginManager: PluginManager;
  refs: RefResolver;
  projectId: string;
  glossaryId: string | undefined;
  memoryId: string | undefined;
  agentDefinitionId: string | undefined;
  contentNodeId: string | undefined;
  db: DrizzleDB;
  userId: string;
  signal?: AbortSignal | undefined;
};

export type CaseResult = {
  caseId: string;
  rawOutput: unknown;
  recallResult?: CandidateRecallResult<{
    id?: number;
    conceptId?: number;
    confidence: number;
    evidences: RecallEvidence[];
  }>;
  durationMs: number;
  status: "ok" | "skipped" | "timeout" | "error";
  error?: string;
};

export type ScenarioResult = {
  scenarioType: string;
  scenarioName?: string;
  testSetName: string;
  cases: CaseResult[];
};

export type ScenarioStrategy = {
  execute: (
    scenario: ScenarioConfig,
    testSet: unknown,
    ctx: HarnessContext,
  ) => Promise<ScenarioResult>;
};
