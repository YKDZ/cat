import {
  collectMemoryRecallOp,
  getMemoryRecallCandidates,
} from "@cat/operations";
import { ServiceImplementationReferenceSchema } from "@cat/shared";
// oxlint-disable no-await-in-loop -- test cases are intentionally sequential to avoid overwhelming the system
// oxlint-disable typescript-eslint/no-unsafe-type-assertion -- params from unknown config require casting
import { trace, SpanStatusCode } from "@opentelemetry/api";

import type { MemoryRecallTestSet, ScenarioConfig } from "#/config/schemas.ts";

import { throwIfEvaluationAborted } from "../../cancellation.ts";
import type { CaseResult, HarnessContext, ScenarioResult } from "../types.ts";
import { DEFAULT_RECALL_OPERATION_TIMEOUT_MS } from "./recall-timeout.ts";

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
      throwIfEvaluationAborted(ctx.signal);
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
          let timer: ReturnType<typeof setTimeout> | undefined;
          try {
            const traceId = `eval-memory-${tc.id}-${Date.now()}`;
            const controller = new AbortController();
            const timeoutMs =
              (params.timeoutMs as number) ??
              DEFAULT_RECALL_OPERATION_TIMEOUT_MS;
            timer = setTimeout(() => {
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
                rerankProvider:
                  params.rerankProvider === undefined
                    ? undefined
                    : ServiceImplementationReferenceSchema.parse(
                        params.rerankProvider,
                      ),
                rerankTimeoutMs: (params.rerankTimeoutMs as number) ?? 3000,
              },
              {
                traceId,
                signal:
                  ctx.signal === undefined
                    ? controller.signal
                    : AbortSignal.any([ctx.signal, controller.signal]),
                pluginManager: ctx.pluginManager,
              },
            );

            const candidates = getMemoryRecallCandidates(result);
            const durationMs = performance.now() - start;
            caseSpan.setAttribute("eval.duration_ms", durationMs);
            caseSpan.setAttribute("eval.status", "ok");
            caseSpan.setAttribute("eval.result_count", candidates.length);
            caseSpan.setStatus({ code: SpanStatusCode.OK });
            cases.push({
              caseId: tc.id,
              rawOutput: candidates,
              recallResult: result,
              durationMs,
              status: "ok",
            });
          } catch (err) {
            throwIfEvaluationAborted(ctx.signal);
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
            if (timer !== undefined) clearTimeout(timer);
            caseSpan.end();
          }
        },
      );
    }

    return {
      scenarioType: "memory-recall",
      ...(scenario.name === undefined ? {} : { scenarioName: scenario.name }),
      testSetName: testSet.name,
      cases,
    };
  },
};
