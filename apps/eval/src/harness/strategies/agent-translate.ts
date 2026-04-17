// oxlint-disable no-console -- intentional diagnostic logging in eval harness
// oxlint-disable no-await-in-loop -- agent loop and element reads are intentionally sequential
// oxlint-disable typescript-eslint/no-unsafe-type-assertion -- params from unknown config require casting
import { trace, SpanStatusCode } from "@opentelemetry/api";

import type {
  ScenarioConfig,
  TranslationTestCase,
  TranslationTestSet,
} from "@/config/schemas";

import type { CaseResult, HarnessContext, ScenarioResult } from "../types";

const tracer = trace.getTracer("cat-eval", "0.0.1");

type AgentTranslateRawOutput = {
  translations: Array<{
    elementRef: string;
    elementId: number;
    text: string;
    createdAt: Date | string;
  }>;
  metrics: {
    promptTokens: number;
    completionTokens: number;
    toolCallCount: number;
    agentLatencyMs: number;
  };
};

export const agentTranslateStrategy = {
  execute: async (
    scenario: ScenarioConfig,
    testSet: TranslationTestSet,
    ctx: HarnessContext,
  ): Promise<ScenarioResult> => {
    if (!ctx.agentDefinitionId) {
      throw new Error(
        "agent-translate strategy requires agentDefinitionId in HarnessContext. " +
          "Set `seed.agentDefinition` in suite.yaml.",
      );
    }

    const cases: CaseResult[] = [];
    const params = scenario.params ?? {};
    const timeoutMs = (params.timeoutMs as number) ?? 600_000;

    for (const tc of testSet.cases) {
      const result = await runTranslationCase(tc, ctx, timeoutMs);
      cases.push(result);
    }

    return {
      scenarioType: "agent-translate",
      testSetName: testSet.name,
      cases,
    };
  },
};

const runTranslationCase = async (
  tc: TranslationTestCase,
  ctx: HarnessContext,
  timeoutMs: number,
): Promise<CaseResult> => {
  return tracer.startActiveSpan(
    "eval.case",
    {
      attributes: {
        "eval.case_id": tc.id,
        "eval.scenario_type": "agent-translate",
        "eval.source_language": tc.sourceLanguage,
        "eval.target_language": tc.targetLanguage,
      },
    },
    async (caseSpan) => {
      const start = performance.now();
      try {
        const rawOutput = await executeAgentTranslation(tc, ctx, timeoutMs);
        const durationMs = performance.now() - start;
        caseSpan.setAttribute("eval.duration_ms", durationMs);
        caseSpan.setAttribute("eval.status", "ok");
        caseSpan.setAttribute(
          "eval.translations_count",
          rawOutput.translations.length,
        );
        caseSpan.setStatus({ code: SpanStatusCode.OK });
        return {
          caseId: tc.id,
          rawOutput,
          durationMs,
          status: "ok" as const,
        };
      } catch (err) {
        const durationMs = performance.now() - start;
        const isAbort =
          err instanceof DOMException && err.name === "AbortError";
        const status = isAbort ? ("timeout" as const) : ("error" as const);
        caseSpan.setAttribute("eval.duration_ms", durationMs);
        caseSpan.setAttribute("eval.status", status);
        caseSpan.setStatus({
          code: SpanStatusCode.ERROR,
          message: String(err),
        });
        return {
          caseId: tc.id,
          rawOutput: null,
          durationMs,
          status,
          error: String(err),
        };
      } finally {
        caseSpan.end();
      }
    },
  );
};

const BATCH_SIZE = 5; // ~20-27 tool calls/batch — reliably fits in PER_BATCH_TIMEOUT_MS
const PER_BATCH_TIMEOUT_MS = 180_000; // 3 min per batch (headroom for slow proxy calls)
const MAX_BATCH_RETRIES = 2; // retry up to 2 times on transient LLM/network errors
const BATCH_RETRY_DELAY_MS = 30_000; // 30 s wait before each retry (allows auth recovery)

const executeAgentTranslation = async (
  tc: TranslationTestCase,
  ctx: HarnessContext,
  timeoutMs: number,
): Promise<AgentTranslateRawOutput> => {
  const {
    AgentRuntime,
    LLMGateway,
    ToolRegistry,
    createNoopAgentLogger,
    PromptEngine,
  } = await import("@cat/agent");
  const {
    finishTool,
    readPrecheckTool,
    updateScratchpadTool,
    getDocumentsTool,
    searchTmTool,
    searchTermbaseTool,
    qaCheckTool,
    listElementsTool,
    getNeighborsTool,
    getTranslationsTool,
    submitTranslationTool,
  } = await import("@cat/agent-tools");
  const { firstOrGivenService, resolvePluginManager } =
    await import("@cat/server-shared");
  const { executeQuery, listTranslationsByElement } =
    await import("@cat/domain");

  // ── Tool registry ────────────────────────────────────────────────────────
  const toolRegistry = new ToolRegistry();
  for (const tool of [
    finishTool,
    readPrecheckTool,
    updateScratchpadTool,
    getDocumentsTool,
    searchTmTool,
    searchTermbaseTool,
    qaCheckTool,
    listElementsTool,
    getNeighborsTool,
    getTranslationsTool,
    submitTranslationTool,
  ]) {
    toolRegistry.register(tool);
  }

  // ── LLM Provider ─────────────────────────────────────────────────────────
  const pm = resolvePluginManager(ctx.pluginManager);
  const llmEntry = firstOrGivenService(pm, "LLM_PROVIDER");
  if (!llmEntry) {
    throw new Error(
      "agent-translate: no LLM_PROVIDER configured in plugin manager. " +
        "Add an LLM provider plugin override to suite.yaml.",
    );
  }
  const gateway = new LLMGateway({ provider: llmEntry.service });

  // ── Build element map ─────────────────────────────────────────────────────
  const elementIdMap = new Map<string, number>();
  for (const ref of tc.elementRefs) {
    const id = ctx.refs.getNumericId(ref);
    elementIdMap.set(ref, id);
  }

  // ── Shared runtime ────────────────────────────────────────────────────────
  const runtime = new AgentRuntime({
    llmGateway: gateway,
    toolRegistry,
    promptEngine: new PromptEngine(),
    logger: createNoopAgentLogger(),
    pluginManager: ctx.pluginManager,
  });

  // ── Split elements into batches and run one agent session per batch ───────
  const allEntries = [...elementIdMap.entries()];
  const batches: Array<Map<string, number>> = [];
  for (let i = 0; i < allEntries.length; i += BATCH_SIZE) {
    batches.push(new Map(allEntries.slice(i, i + BATCH_SIZE)));
  }

  let totalPromptTokens = 0;
  let totalCompletionTokens = 0;
  let totalToolCallCount = 0;
  const agentStart = performance.now();
  const overallDeadline = Date.now() + timeoutMs;

  for (let batchIndex = 0; batchIndex < batches.length; batchIndex += 1) {
    if (Date.now() >= overallDeadline) {
      console.warn(
        `[eval] Overall timeout reached; stopping before batch ${batchIndex + 1}/${batches.length}`,
      );
      break;
    }

    const batchMap = batches[batchIndex];
    const batchListLines = [...batchMap.entries()]
      .map(([ref, id]) => `- Element ID ${id} (ref: ${ref})`)
      .join("\n");

    let batchInstruction = `${tc.instruction}\n\nElements to translate (target language: ${tc.targetLanguage}):\n${batchListLines}`;
    if (ctx.glossaryId) {
      batchInstruction += `\n\nGlossary available (use search_termbase to look up terms).`;
    }
    if (ctx.memoryId) {
      batchInstruction += `\n\nTranslation memory available (use search_tm to find existing translations).`;
    }
    batchInstruction +=
      `\n\nPlease submit a translation for each of the ${batchMap.size} element IDs listed above ` +
      `using submit_translation. When all ${batchMap.size} have been submitted, call finish.`;

    let batchPromptTokens = 0;
    let batchCompletionTokens = 0;
    let batchToolCallCount = 0;
    let batchFinishReason: "finish" | "maxTurns" | "timeout" | undefined;

    // ── Retry loop for transient LLM/network errors ───────────────────────
    for (let attempt = 0; attempt <= MAX_BATCH_RETRIES; attempt += 1) {
      if (Date.now() >= overallDeadline) break;

      if (attempt > 0) {
        const waitMs = Math.min(
          BATCH_RETRY_DELAY_MS,
          overallDeadline - Date.now(),
        );
        console.log(
          `[eval] Batch ${batchIndex + 1}/${batches.length} retry ${attempt}/${MAX_BATCH_RETRIES} — waiting ${Math.round(waitMs / 1000)}s...`,
        );
        // oxlint-disable-next-line no-await-in-loop -- intentional sequential retry delay
        await new Promise<void>((resolve) => setTimeout(resolve, waitMs));
        if (Date.now() >= overallDeadline) break;
      }

      const remainingMs = overallDeadline - Date.now();
      const batchTimeoutMs = Math.min(PER_BATCH_TIMEOUT_MS, remainingMs);

      // oxlint-disable-next-line no-await-in-loop -- batches must run sequentially
      const { sessionId, runId } = await runtime.startSession({
        agentDefinitionId: ctx.agentDefinitionId!,
        userId: ctx.userId,
        projectId: ctx.projectId,
        metadata: {
          projectId: ctx.projectId,
          languageId: tc.targetLanguage,
          sourceLanguageId: tc.sourceLanguage,
          documentId: ctx.documentId,
        },
        initialMessage: batchInstruction,
      });

      const timeoutController = new AbortController();
      const timer = setTimeout(() => {
        timeoutController.abort();
      }, batchTimeoutMs);

      let attemptPromptTokens = 0;
      let attemptCompletionTokens = 0;
      let attemptToolCallCount = 0;
      let attemptFinishReason: "finish" | "maxTurns" | "timeout" | undefined;
      let attemptSucceeded = false;

      try {
        // oxlint-disable-next-line no-await-in-loop -- agent event loop is inherently sequential
        for await (const event of runtime.runLoop(sessionId, runId)) {
          if (timeoutController.signal.aborted) {
            throw new DOMException("Agent timed out", "AbortError");
          }
          if (event.type === "llm_complete") {
            attemptPromptTokens += event.tokenUsage.promptTokens;
            attemptCompletionTokens += event.tokenUsage.completionTokens;
          } else if (event.type === "tool_call") {
            attemptToolCallCount += 1;
          } else if (event.type === "finished") {
            attemptFinishReason = event.reason;
          } else if (event.type === "failed") {
            throw event.error;
          }
        }
        attemptSucceeded = true;
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
          console.warn(
            `[eval] Batch ${batchIndex + 1}/${batches.length} timed out after ${Math.round(batchTimeoutMs / 1000)}s; keeping partial results`,
          );
          attemptSucceeded = true; // timeout counts as partial success — don't retry
        } else {
          const isLastAttempt = attempt === MAX_BATCH_RETRIES;
          console.error(
            `[eval] Batch ${batchIndex + 1}/${batches.length} attempt ${attempt + 1}/${MAX_BATCH_RETRIES + 1} failed${isLastAttempt ? " (giving up)" : " (will retry)"}:`,
            err instanceof Error ? err.message : String(err),
          );
        }
      } finally {
        clearTimeout(timer);
      }

      batchPromptTokens += attemptPromptTokens;
      batchCompletionTokens += attemptCompletionTokens;
      batchToolCallCount += attemptToolCallCount;
      if (attemptFinishReason) batchFinishReason = attemptFinishReason;

      if (attemptSucceeded) break;
    }

    if (batchFinishReason === "maxTurns") {
      console.warn(
        `[eval] Batch ${batchIndex + 1}/${batches.length} hit maxTurns; partial results kept`,
      );
    }

    totalPromptTokens += batchPromptTokens;
    totalCompletionTokens += batchCompletionTokens;
    totalToolCallCount += batchToolCallCount;

    console.log(
      `[eval] Batch ${batchIndex + 1}/${batches.length} done — ` +
        `finishReason=${batchFinishReason} toolCalls=${batchToolCallCount} promptTokens=${batchPromptTokens}`,
    );
  }

  const agentLatencyMs = performance.now() - agentStart;

  // ── Read back all translations from DB (across all batch sessions) ────────
  const db = ctx.db.client;
  const translations: AgentTranslateRawOutput["translations"] = [];

  for (const [ref, elementId] of elementIdMap.entries()) {
    // oxlint-disable-next-line no-await-in-loop -- sequential DB reads for ordered element collection
    const results = await executeQuery({ db }, listTranslationsByElement, {
      elementId,
      languageId: tc.targetLanguage,
    });
    // Sort by createdAt descending to get the latest translation
    const sorted = results.slice().sort((a, b) => {
      const dateA =
        a.createdAt instanceof Date ? a.createdAt : new Date(a.createdAt);
      const dateB =
        b.createdAt instanceof Date ? b.createdAt : new Date(b.createdAt);
      return dateB.getTime() - dateA.getTime();
    });
    if (sorted.length > 0) {
      translations.push({
        elementRef: ref,
        elementId,
        text: sorted[0].text,
        createdAt: sorted[0].createdAt,
      });
    }
  }

  console.log(
    `[eval] DB read complete — found ${translations.length}/${elementIdMap.size} translations`,
  );

  return {
    translations,
    metrics: {
      promptTokens: totalPromptTokens,
      completionTokens: totalCompletionTokens,
      toolCallCount: totalToolCallCount,
      agentLatencyMs,
    },
  };
};
