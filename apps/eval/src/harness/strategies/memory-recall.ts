// oxlint-disable no-await-in-loop -- test cases are intentionally sequential to avoid overwhelming the system
// oxlint-disable typescript-eslint/no-unsafe-type-assertion -- params from unknown config require casting
import { collectMemoryRecallOp } from "@cat/operations";

import type { MemoryRecallTestSet, ScenarioConfig } from "@/config/schemas";

import type { CaseResult, HarnessContext, ScenarioResult } from "../types";

export const memoryRecallStrategy = {
  execute: async (
    scenario: ScenarioConfig,
    testSet: MemoryRecallTestSet,
    ctx: HarnessContext,
  ): Promise<ScenarioResult> => {
    const cases: CaseResult[] = [];
    const memoryIds = ctx.memoryId ? [ctx.memoryId] : [];
    const params = scenario.params ?? {};

    for (const tc of testSet.cases) {
      const start = performance.now();
      try {
        const traceId = `eval-memory-${tc.id}-${Date.now()}`;
        const controller = new AbortController();
        const timeoutMs = (params.timeoutMs as number) ?? 30_000;
        const timer = setTimeout(() => {
          controller.abort();
        }, timeoutMs);

        const result = await collectMemoryRecallOp(
          {
            text: tc.inputText,
            sourceLanguageId: tc.sourceLanguage,
            translationLanguageId: tc.targetLanguage,
            memoryIds,
            minSimilarity: (params.minSimilarity as number) ?? 0.72,
            minVariantSimilarity:
              (params.minVariantSimilarity as number) ?? 0.7,
            maxAmount: (params.maxAmount as number) ?? 5,
          },
          {
            traceId,
            signal: controller.signal,
            pluginManager: ctx.pluginManager,
          },
        );

        clearTimeout(timer);
        const durationMs = performance.now() - start;
        cases.push({
          caseId: tc.id,
          rawOutput: result,
          durationMs,
          status: "ok",
        });
      } catch (err) {
        const durationMs = performance.now() - start;
        const isAbort =
          err instanceof DOMException && err.name === "AbortError";
        cases.push({
          caseId: tc.id,
          rawOutput: null,
          durationMs,
          status: isAbort ? "timeout" : "error",
          error: String(err),
        });
      }
    }

    return { scenarioType: "memory-recall", testSetName: testSet.name, cases };
  },
};
