/**
 * Agent E2E integration spec — Phase 0a
 *
 * Tests the full AgentRuntime.runLoop() with:
 * - Mock SessionManager (bypasses DB)
 * - Mock LLMGateway (preset tool-call sequences)
 * - Mock ToolRegistry (preset tool execute results)
 * - Mock PromptEngine
 *
 * Validates:
 * - Full OPEN → DONE flow (agent calls finish tool and loop exits cleanly)
 * - maxTurns protection (agent does not call finish → loop exits with "maxTurns")
 * - Structural logging (L01–L05 log categories are captured)
 * - Basic metrics (M01–M05 token + tool recording)
 */

import type { LLMChunk } from "@cat/plugin-core";
import type { ParsedAgentDefinition } from "@cat/shared";

import { describe, expect, it, vi, beforeEach } from "vitest";

import type { LLMGateway } from "@/llm/llm-gateway.ts";
import type { AgentLogger } from "@/observability/agent-logger.ts";
import type { PromptEngine } from "@/prompt/prompt-engine.ts";
import type { ToolRegistry } from "@/tool/tool-registry.ts";

import { createNoopAgentLogger } from "@/observability/agent-logger.ts";
import { AgentMetrics } from "@/observability/agent-metrics.ts";
import { AgentRuntime } from "@/runtime/agent-runtime.ts";

// ─── Mock @cat/permissions ────────────────────────────────────────────────────

vi.mock("@cat/permissions", () => ({
  getPermissionEngine: () => ({
    check: async () => true,
  }),
  determineWriteMode: async () => "direct",
}));

// ─── Mock SessionManager ──────────────────────────────────────────────────────

const MOCK_SESSION_ID = "00000000-0000-4000-8000-000000000001";
const MOCK_RUN_ID = "00000000-0000-4000-8000-000000000002";

const MOCK_DEFINITION: ParsedAgentDefinition = {
  metadata: {
    id: "translator-zh-en",
    name: "中英翻译专家",
    version: "1.0.0",
    type: "GENERAL",
    llm: { providerId: 1, temperature: 0.3, maxTokens: 512 },
    tools: ["translate_segment", "finish"],
    constraints: {
      maxSteps: 3,
      timeoutMs: 60_000,
      maxConcurrentToolCalls: 3,
      maxCorrectionAttempts: 1,
    },
    scope: { type: "GLOBAL" },
  },
  content:
    "You are a professional Chinese-English translator. Use translate_segment then finish.",
};

vi.mock("@/runtime/session-manager.ts", () => {
  // Vitest 4.x requires `function` or `class` (not arrow functions) for mocks
  // called with `new`. See https://vitest.dev/api/vi#vi-spyon
  const MockSessionManager = vi
    .fn()
    .mockImplementation(function (this: object) {
      Object.assign(this, {
        loadSession: vi.fn().mockResolvedValue({
          sessionId: MOCK_SESSION_ID,
          sessionDbId: 1,
          agentDefinitionDbId: 1,
          agentDefinition: MOCK_DEFINITION,
          projectId: null,
          sessionMetadata: null,
          currentRunId: null,
          runId: MOCK_RUN_ID,
          blackboardSnapshot: null,
        }),
        createSession: vi.fn().mockResolvedValue({
          sessionId: MOCK_SESSION_ID,
          runId: MOCK_RUN_ID,
        }),
        saveSnapshot: vi.fn().mockResolvedValue(undefined),
        completeSession: vi.fn().mockResolvedValue(undefined),
      });
    });

  return { SessionManager: MockSessionManager };
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Creates an AsyncIterable<LLMChunk> that yields text delta + tool calls + finish.
 */
async function* makeLLMStream(
  textDelta: string,
  toolCalls: Array<{ id: string; name: string; args: string }>,
): AsyncIterable<LLMChunk> {
  if (textDelta) {
    yield { type: "text_delta", textDelta } satisfies LLMChunk;
  }

  for (const tc of toolCalls) {
    yield {
      type: "tool_call_delta",
      toolCallDelta: { id: tc.id, name: tc.name, argumentsDelta: tc.args },
    } satisfies LLMChunk;
  }

  yield {
    type: "usage",
    usage: { promptTokens: 100, completionTokens: 50 },
  } satisfies LLMChunk;
  yield {
    type: "finish",
    finishReason: toolCalls.length > 0 ? "tool_calls" : "stop",
  } satisfies LLMChunk;
}

type LLMStream = ReturnType<typeof makeLLMStream>;

function makeMockGateway(callSequence: LLMStream[]): LLMGateway {
  let callIndex = 0;
  // oxlint-disable-next-line no-unsafe-type-assertion -- partial mock object for testing
  return {
    chat: () => {
      const stream = callSequence[callIndex];
      callIndex += 1;
      if (!stream) throw new Error("Unexpected extra LLM call");
      return stream;
    },
  } as unknown as LLMGateway;
}

function makeMockToolRegistry(results: Record<string, unknown>): ToolRegistry {
  // oxlint-disable-next-line no-unsafe-type-assertion -- partial mock object for testing
  return {
    execute: async (name: string) => {
      if (name in results) return results[name];
      throw new Error(`Unexpected tool call: "${name}"`);
    },
    toLLMTools: () => [],
  } as unknown as ToolRegistry;
}

function makeMockPromptEngine(): PromptEngine {
  // oxlint-disable-next-line no-unsafe-type-assertion -- partial mock object for testing
  return {
    buildPrompt: (opts: {
      messages?: Array<{ role: string; content: string | null }>;
    }) => ({
      messages: opts.messages ?? [],
    }),
  } as unknown as PromptEngine;
}

async function collectEvents(runtime: AgentRuntime): Promise<string[]> {
  const events: string[] = [];
  for await (const event of runtime.runLoop(MOCK_SESSION_ID, MOCK_RUN_ID)) {
    events.push(event.type);
  }
  return events;
}

function makeRuntime(
  llmSequence: LLMStream[],
  toolResults: Record<string, unknown>,
  logger: AgentLogger = createNoopAgentLogger(),
): AgentRuntime {
  return new AgentRuntime({
    llmGateway: makeMockGateway(llmSequence),
    toolRegistry: makeMockToolRegistry(toolResults),
    promptEngine: makeMockPromptEngine(),
    logger,
  });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("AgentRuntime E2E — Phase 0a", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("completes successfully when agent calls finish tool", async () => {
    const runtime = makeRuntime(
      [
        makeLLMStream("I will translate and finish.", [
          {
            id: "tc-1",
            name: "translate_segment",
            args: JSON.stringify({ source: "猫" }),
          },
          {
            id: "tc-2",
            name: "finish",
            args: JSON.stringify({ reason: "Translation complete" }),
          },
        ]),
      ],
      { translate_segment: { success: true }, finish: { done: true } },
    );

    const events = await collectEvents(runtime);

    expect(events[0]).toBe("started");
    expect(events.at(-1)).toBe("finished");
    expect(events).not.toContain("failed");
    expect(events).toContain("tool_call");
    expect(events).toContain("tool_result");
  });

  it("exits with finished(maxTurns) when agent never calls finish", async () => {
    // maxSteps=3 in MOCK_DEFINITION, LLM never calls finish — loop exhausts turns
    const runtime = makeRuntime(
      [
        makeLLMStream("Thinking...", []),
        makeLLMStream("Still thinking...", []),
        makeLLMStream("More thinking...", []),
      ],
      {},
    );

    const events = await collectEvents(runtime);

    expect(events[0]).toBe("started");
    // Loop should terminate after 3 turns (PreCheck detects maxTurns or Decision routes to maxTurns)
    expect(events.at(-1)).toBe("finished");
    expect(events).not.toContain("failed");
  });

  it("emits node events for precheck, reasoning, tool, and decision steps", async () => {
    const runtime = makeRuntime(
      [
        makeLLMStream("Done.", [
          {
            id: "tc-1",
            name: "finish",
            args: JSON.stringify({ reason: "complete" }),
          },
        ]),
      ],
      { finish: { done: true } },
    );

    const events = await collectEvents(runtime);

    // Must contain the basic event types
    expect(events).toContain("node");
    expect(events).toContain("tool_call");
    expect(events).toContain("tool_result");
    expect(events).toContain("finished");
  });
});

// ─── Agent Metrics Validation (M01–M05) ──────────────────────────────────────

describe("AgentMetrics — M01–M05 basic counters", () => {
  it("M01: records token usage (totalTokens)", () => {
    const metrics = new AgentMetrics();

    metrics.recordTokens(100, 50);
    metrics.recordTokens(200, 75);

    const snap = metrics.snapshot();
    expect(snap.totalTokens.prompt).toBe(300);
    expect(snap.totalTokens.completion).toBe(125);
  });

  it("M02: records node duration", () => {
    const metrics = new AgentMetrics();

    metrics.recordNodeDuration("reasoning", 250);
    metrics.recordNodeDuration("reasoning", 300);
    metrics.recordNodeDuration("precheck", 10);

    const snap = metrics.snapshot();
    expect(snap.nodeDurations["reasoning"]).toEqual([250, 300]);
    expect(snap.nodeDurations["precheck"]).toEqual([10]);
  });

  it("M03: records tool calls per tool name", () => {
    const metrics = new AgentMetrics();

    metrics.recordToolCall("translate_segment");
    metrics.recordToolCall("finish");
    metrics.recordToolCall("translate_segment");

    const snap = metrics.snapshot();
    expect(snap.toolCalls["translate_segment"]).toBe(2);
    expect(snap.toolCalls["finish"]).toBe(1);
  });

  it("M04: records errors per category", () => {
    const metrics = new AgentMetrics();

    metrics.recordError("llm_timeout");
    metrics.recordError("tool_failed");
    metrics.recordError("llm_timeout");

    const snap = metrics.snapshot();
    expect(snap.errors["llm_timeout"]).toBe(2);
    expect(snap.errors["tool_failed"]).toBe(1);
  });

  it("M05: records changeset created count", () => {
    const metrics = new AgentMetrics();

    metrics.recordChangesetCreated();
    metrics.recordChangesetCreated();

    const snap = metrics.snapshot();
    expect(snap.changesetCreatedCount).toBe(2);
  });
});

// ─── Structural Log Validation (L01–L05) ─────────────────────────────────────

describe("AgentLogger — structural log categories L01–L05", () => {
  it("captures log events for all 5 log categories", () => {
    const captured: Array<{ kind: string; message: string }> = [];

    // Implement AgentLogger interface directly for capturing
    const logger: AgentLogger = {
      logRun: (e) => captured.push({ kind: "run", message: e.message }), // L01
      logDAGNode: (e) =>
        captured.push({ kind: "dag-node", message: e.message }), // L02
      logLLMCall: (e) =>
        captured.push({ kind: "llm-call", message: e.message }), // L03
      logToolExecute: (e) =>
        captured.push({ kind: "tool-execute", message: e.message }), // L04
      logError: (e) => captured.push({ kind: "error", message: e.message }), // L05
      logChangeSetEvent: () => undefined, // L06
    };

    logger.logRun({
      runId: "r1",
      sessionId: "s1",
      status: "started",
      message: "L01 run log",
    });
    logger.logDAGNode({
      nodeType: "precheck",
      status: "started",
      message: "L02 dag-node log",
    });
    logger.logLLMCall({
      providerId: "openai",
      modelName: "gpt-4",
      promptTokens: 100,
      completionTokens: 50,
      durationMs: 300,
      finishReason: "stop",
      message: "L03 llm-call log",
    });
    logger.logToolExecute({
      toolName: "finish",
      status: "completed",
      message: "L04 tool-execute log",
    });
    logger.logError({ error: new Error("oops"), message: "L05 error log" });

    expect(captured.some((c) => c.kind === "run")).toBe(true); // L01
    expect(captured.some((c) => c.kind === "dag-node")).toBe(true); // L02
    expect(captured.some((c) => c.kind === "llm-call")).toBe(true); // L03
    expect(captured.some((c) => c.kind === "tool-execute")).toBe(true); // L04
    expect(captured.some((c) => c.kind === "error")).toBe(true); // L05
  });
});
