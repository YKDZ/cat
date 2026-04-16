// oxlint-disable no-console -- intentional diagnostic logging in eval harness
// oxlint-disable no-await-in-loop -- scenarios are intentionally sequential
import { trace, SpanStatusCode } from "@opentelemetry/api";

import type { LoadedSuite } from "@/config";
import type { RefResolver } from "@/seeder/ref-resolver";
import type { SeededContext } from "@/seeder/types";

import { seed } from "@/seeder";

import type { HarnessContext, ScenarioResult } from "./types";

import { getStrategy } from "./strategies";

const tracer = trace.getTracer("cat-eval", "0.0.1");

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

  return tracer.startActiveSpan(
    "eval.run",
    { attributes: { "eval.suite": suite.config.name, "eval.run_id": runId } },
    async (rootSpan) => {
      let seededCtx: SeededContext | undefined;
      try {
        console.log(
          `[eval] Seeding database for suite "${suite.config.name}"...`,
        );

        seededCtx = await tracer.startActiveSpan(
          "eval.seed",
          { attributes: { "eval.suite": suite.config.name } },
          async (seedSpan) => {
            try {
              const ctx = await seed({ suite, cacheDir, pluginsDir });
              seedSpan.setAttribute("eval.project_id", ctx.projectId);
              seedSpan.setStatus({ code: SpanStatusCode.OK });
              return ctx;
            } catch (err) {
              seedSpan.setStatus({
                code: SpanStatusCode.ERROR,
                message: String(err),
              });
              throw err;
            } finally {
              seedSpan.end();
            }
          },
        );

        console.log(`[eval] Seeding complete. Project: ${seededCtx.projectId}`);

        const harnessCtx: HarnessContext = {
          pluginManager: seededCtx.pluginManager,
          refs: seededCtx.refs,
          projectId: seededCtx.projectId,
          glossaryId: seededCtx.glossaryId,
          memoryId: seededCtx.memoryId,
          agentDefinitionId: seededCtx.agentDefinitionId,
          documentId: seededCtx.documentId,
          db: seededCtx.db,
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

          const result = await tracer.startActiveSpan(
            "eval.scenario",
            {
              attributes: {
                "eval.scenario_type": scenarioCfg.type,
                "eval.test_set": testSetPath,
              },
            },
            async (scenarioSpan) => {
              try {
                const strategy = getStrategy(scenarioCfg.type);
                const r = await strategy.execute(
                  scenarioCfg,
                  testSet,
                  harnessCtx,
                );
                for (const c of r.cases) {
                  if (c.status !== "ok" && c.error) {
                    console.error(
                      `[eval] Case "${c.caseId}" failed (${c.status}): ${c.error}`,
                    );
                  }
                }
                const okCount = r.cases.filter((c) => c.status === "ok").length;
                scenarioSpan.setAttribute("eval.cases_total", r.cases.length);
                scenarioSpan.setAttribute("eval.cases_ok", okCount);
                scenarioSpan.setStatus({ code: SpanStatusCode.OK });
                return r;
              } catch (err) {
                scenarioSpan.setStatus({
                  code: SpanStatusCode.ERROR,
                  message: String(err),
                });
                throw err;
              } finally {
                scenarioSpan.end();
              }
            },
          );

          scenarioResults.push(result);

          const okCount = result.cases.filter((c) => c.status === "ok").length;
          console.log(
            `[eval] Scenario done: ${okCount}/${result.cases.length} cases OK`,
          );
        }

        rootSpan.setAttribute(
          "eval.duration_ms",
          performance.now() - startTime,
        );
        rootSpan.setStatus({ code: SpanStatusCode.OK });

        return {
          runId,
          suiteName: suite.config.name,
          timestamp: new Date().toISOString(),
          durationMs: performance.now() - startTime,
          scenarioResults,
          refs: seededCtx.refs,
        };
      } catch (err) {
        rootSpan.setStatus({
          code: SpanStatusCode.ERROR,
          message: String(err),
        });
        throw err;
      } finally {
        rootSpan.end();
        if (seededCtx) {
          console.log("[eval] Cleaning up test database...");
          await seededCtx.cleanup();
        }
      }
    },
  );
};
