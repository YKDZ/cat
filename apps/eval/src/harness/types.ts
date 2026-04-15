import type { PluginManager } from "@cat/plugin-core";

import type { ScenarioConfig } from "@/config/schemas";
import type { RefResolver } from "@/seeder/ref-resolver";

export type HarnessContext = {
  pluginManager: PluginManager;
  refs: RefResolver;
  projectId: string;
  glossaryId: string | undefined;
  memoryId: string | undefined;
  userId: string;
};

export type CaseResult = {
  caseId: string;
  rawOutput: unknown;
  durationMs: number;
  status: "ok" | "skipped" | "timeout" | "error";
  error?: string;
};

export type ScenarioResult = {
  scenarioType: string;
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
