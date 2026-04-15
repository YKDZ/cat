// oxlint-disable no-console -- intentional diagnostic logging in eval harness
// oxlint-disable no-await-in-loop -- scenarios are intentionally sequential
import type { LoadedSuite } from "@/config";
import type { RefResolver } from "@/seeder/ref-resolver";
import type { SeededContext } from "@/seeder/types";

import { seed } from "@/seeder";

import type { HarnessContext, ScenarioResult } from "./types";

import { getStrategy } from "./strategies";

export type RunResult = {
  runId: string;
  suiteName: string;
  timestamp: string;
  durationMs: number;
  scenarioResults: ScenarioResult[];
  refs: RefResolver;
};

export type HarnessOptions = {
  suite: LoadedSuite;
  cacheDir: string;
  pluginsDir: string;
  scenarioFilter?: string;
};

export const runHarness = async (opts: HarnessOptions): Promise<RunResult> => {
  const { suite, cacheDir, pluginsDir, scenarioFilter } = opts;
  const runId = `eval-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const startTime = performance.now();

  let seededCtx: SeededContext | undefined;
  try {
    console.log(`[eval] Seeding database for suite "${suite.config.name}"...`);
    seededCtx = await seed({ suite, cacheDir, pluginsDir });
    console.log(`[eval] Seeding complete. Project: ${seededCtx.projectId}`);

    const harnessCtx: HarnessContext = {
      pluginManager: seededCtx.pluginManager,
      refs: seededCtx.refs,
      projectId: seededCtx.projectId,
      glossaryId: seededCtx.glossaryId,
      memoryId: seededCtx.memoryId,
      userId: seededCtx.userId,
    };

    const scenarioResults: ScenarioResult[] = [];

    for (const scenarioCfg of suite.config.scenarios) {
      if (scenarioFilter && scenarioCfg.type !== scenarioFilter) continue;

      const testSetPath = scenarioCfg["test-set"];
      const testSet = suite.testSets.get(testSetPath);
      if (!testSet) {
        throw new Error(`Test set not found: "${testSetPath}"`);
      }

      console.log(
        `[eval] Running scenario: ${scenarioCfg.type} (${testSetPath})`,
      );
      const strategy = getStrategy(scenarioCfg.type);
      const result = await strategy.execute(scenarioCfg, testSet, harnessCtx);
      scenarioResults.push(result);

      const okCount = result.cases.filter((c) => c.status === "ok").length;
      console.log(
        `[eval] Scenario done: ${okCount}/${result.cases.length} cases OK`,
      );
    }

    return {
      runId,
      suiteName: suite.config.name,
      timestamp: new Date().toISOString(),
      durationMs: performance.now() - startTime,
      scenarioResults,
      refs: seededCtx.refs,
    };
  } finally {
    if (seededCtx) {
      console.log("[eval] Cleaning up test database...");
      await seededCtx.cleanup();
    }
  }
};
