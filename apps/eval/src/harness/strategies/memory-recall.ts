import { collectMemoryRecallOp } from "@cat/operations";
// oxlint-disable no-await-in-loop -- test cases are intentionally sequential to avoid overwhelming the system
// oxlint-disable typescript-eslint/no-unsafe-type-assertion -- params from unknown config require casting
import { trace, SpanStatusCode } from "@opentelemetry/api";

import type { MemoryRecallTestSet, ScenarioConfig } from "@/config/schemas";

import type { CaseResult, HarnessContext, ScenarioResult } from "../types";

const tracer = trace.getTracer("cat-eval", "0.0.1");

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
      await tracer.startActiveSpan(
        "eval.case",
        {
          attributes: {
            "eval.case_id": tc.id,
            "eval.scenario_type": "memory-recall",
            "eval.input_text": tc.inputText,
            "eval.source_language": tc.sourceLanguage,
            "eval.target_language": tc.targetLanguage,
          },
        },
        async (caseSpan) => {
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
                rerankMode:
                  (params.rerankMode as "baseline" | "reranked") ?? "reranked",
                rerankProviderId: params.rerankProviderId as number | undefined,
                rerankTimeoutMs: (params.rerankTimeoutMs as number) ?? 3000,
              },
              {
                traceId,
                signal: controller.signal,
                pluginManager: ctx.pluginManager,
              },
            );

            clearTimeout(timer);
            const durationMs = performance.now() - start;
            caseSpan.setAttribute("eval.duration_ms", durationMs);
            caseSpan.setAttribute("eval.status", "ok");
            caseSpan.setAttribute(
              "eval.result_count",
              Array.isArray(result) ? result.length : 0,
            );
            caseSpan.setStatus({ code: SpanStatusCode.OK });
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
            const status = isAbort ? "timeout" : "error";
            caseSpan.setAttribute("eval.duration_ms", durationMs);
            caseSpan.setAttribute("eval.status", status);
            caseSpan.setStatus({
              code: SpanStatusCode.ERROR,
              message: String(err),
            });
            cases.push({
              caseId: tc.id,
              rawOutput: null,
              durationMs,
              status,
              error: String(err),
            });
          } finally {
            caseSpan.end();
          }
        },
      );
    }

    return {
      scenarioType: "memory-recall",
      scenarioName: scenario.name,
      testSetName: testSet.name,
      cases,
    };
  },
};
