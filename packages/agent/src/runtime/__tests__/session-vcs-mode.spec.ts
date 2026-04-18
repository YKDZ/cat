/**
 * @zh AgentRuntime.runLoop() vcsMode 动态计算单元测试。
 * @en Unit tests for dynamic vcsMode calculation in AgentRuntime.runLoop().
 *
 * Validates:
 * - determineWriteMode returns "direct"      → vcsMode = "direct" passed to tool context
 * - determineWriteMode returns "isolation"   → vcsMode = "isolation" passed to tool context
 * - determineWriteMode returns "no_access"   → runLoop() throws error
 */

import type { LLMChunk } from "@cat/plugin-core";
import type { ParsedAgentDefinition } from "@cat/shared/schema/agent";

import { beforeEach, describe, expect, it, vi } from "vitest";

import type { LLMGateway } from "@/llm/llm-gateway.ts";
import type { PromptEngine } from "@/prompt/prompt-engine.ts";
import type { ToolRegistry } from "@/tool/tool-registry.ts";
import type { ToolExecutionContext } from "@/tool/tool-types.ts";

import { createNoopAgentLogger } from "@/observability/agent-logger.ts";
import { AgentRuntime } from "@/runtime/agent-runtime.ts";

// ─── Mock @cat/permissions ────────────────────────────────────────────────────

const permsMock = vi.hoisted(() => ({
  determineWriteMode:
    vi.fn<() => Promise<"direct" | "isolation" | "no_access">>(),
}));

vi.mock("@cat/permissions", () => ({
  getPermissionEngine: () => ({ check: async () => true }),
  determineWriteMode: permsMock.determineWriteMode,
}));

// ─── Mock SessionManager ──────────────────────────────────────────────────────

const MOCK_SESSION_ID = "00000000-0000-4000-8000-000000000011";
const MOCK_RUN_ID = "00000000-0000-4000-8000-000000000012";
const MOCK_PROJECT_ID = "00000000-0000-4000-8000-000000000099";

const MOCK_DEFINITION: ParsedAgentDefinition = {
  metadata: {
    id: "vcs-mode-test-agent",
    name: "VCS Mode Test Agent",
    version: "1.0.0",
    type: "GENERAL",
    llm: { providerId: 1, temperature: 0.0, maxTokens: 128 },
    tools: ["probe_tool", "finish"],
    constraints: {
      maxSteps: 2,
      timeoutMs: 30_000,
      maxConcurrentToolCalls: 1,
      maxCorrectionAttempts: 0,
    },
    scope: { type: "GLOBAL" },
  },
  content: "Test agent for vcsMode propagation.",
};

vi.mock("@/runtime/session-manager.ts", () => {
  const MockSessionManager = vi
    .fn()
    .mockImplementation(function (this: object) {
      Object.assign(this, {
        loadSession: vi.fn().mockResolvedValue({
          sessionId: MOCK_SESSION_ID,
          sessionDbId: 1,
          agentDefinitionDbId: 1,
          agentDefinition: MOCK_DEFINITION,
          projectId: MOCK_PROJECT_ID,
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

async function* makeLLMStream(
  toolCalls: Array<{ id: string; name: string; args: string }>,
): AsyncIterable<LLMChunk> {
  for (const tc of toolCalls) {
    yield {
      type: "tool_call_delta",
      toolCallDelta: { id: tc.id, name: tc.name, argumentsDelta: tc.args },
    } satisfies LLMChunk;
  }
  yield {
    type: "usage",
    usage: { promptTokens: 10, completionTokens: 5 },
  } satisfies LLMChunk;
  yield {
    type: "finish",
    finishReason: toolCalls.length > 0 ? "tool_calls" : "stop",
  } satisfies LLMChunk;
}

type LLMStream = ReturnType<typeof makeLLMStream>;

function makeMockGateway(callSequence: LLMStream[]): LLMGateway {
  let callIndex = 0;
  // oxlint-disable-next-line no-unsafe-type-assertion
  return {
    chat: () => {
      const stream = callSequence[callIndex];
      callIndex += 1;
      if (!stream) throw new Error("Unexpected extra LLM call");
      return stream;
    },
  } as unknown as LLMGateway;
}

function makeMockPromptEngine(): PromptEngine {
  // oxlint-disable-next-line no-unsafe-type-assertion
  return {
    buildPrompt: (opts: {
      messages?: Array<{ role: string; content: string | null }>;
    }) => ({
      messages: opts.messages ?? [],
    }),
  } as unknown as PromptEngine;
}

/**
 * Build a mock ToolRegistry that captures the ToolExecutionContext passed to `execute`.
 */
function makeCaptureRegistry(): {
  registry: ToolRegistry;
  getCaptured: () => ToolExecutionContext | undefined;
} {
  let captured: ToolExecutionContext | undefined;

  // oxlint-disable-next-line no-unsafe-type-assertion
  const registry = {
    execute: vi.fn(
      async (
        _name: string,
        _args: Record<string, unknown>,
        ctx: ToolExecutionContext,
      ) => {
        captured = ctx;
        return {};
      },
    ),
    toLLMTools: () => [],
  } as unknown as ToolRegistry;

  return { registry, getCaptured: () => captured };
}

async function collectEvents(runtime: AgentRuntime): Promise<string[]> {
  const events: string[] = [];
  for await (const event of runtime.runLoop(MOCK_SESSION_ID, MOCK_RUN_ID)) {
    events.push(event.type);
  }
  return events;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("AgentRuntime.runLoop() — vcsMode dynamic calculation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('determineWriteMode "direct" → vcsMode "direct" propagated to tool context', async () => {
    permsMock.determineWriteMode.mockResolvedValue("direct");

    const { registry, getCaptured } = makeCaptureRegistry();

    const runtime = new AgentRuntime({
      llmGateway: makeMockGateway([
        makeLLMStream([{ id: "tc-1", name: "probe_tool", args: "{}" }]),
        makeLLMStream([
          { id: "tc-2", name: "finish", args: '{"reason":"done"}' },
        ]),
      ]),
      toolRegistry: registry,
      promptEngine: makeMockPromptEngine(),
      logger: createNoopAgentLogger(),
    });

    const events = await collectEvents(runtime);

    expect(events).toContain("tool_call");
    expect(getCaptured()?.vcsMode).toBe("direct");
  });

  it('determineWriteMode "isolation" → vcsMode "isolation" propagated to tool context', async () => {
    permsMock.determineWriteMode.mockResolvedValue("isolation");

    const { registry, getCaptured } = makeCaptureRegistry();

    const runtime = new AgentRuntime({
      llmGateway: makeMockGateway([
        makeLLMStream([{ id: "tc-1", name: "probe_tool", args: "{}" }]),
        makeLLMStream([
          { id: "tc-2", name: "finish", args: '{"reason":"done"}' },
        ]),
      ]),
      toolRegistry: registry,
      promptEngine: makeMockPromptEngine(),
      logger: createNoopAgentLogger(),
    });

    const events = await collectEvents(runtime);

    expect(events).toContain("tool_call");
    expect(getCaptured()?.vcsMode).toBe("isolation");
  });

  it('determineWriteMode "no_access" → runLoop() throws error', async () => {
    permsMock.determineWriteMode.mockResolvedValue("no_access");

    const runtime = new AgentRuntime({
      llmGateway: makeMockGateway([]),
      toolRegistry: makeCaptureRegistry().registry,
      promptEngine: makeMockPromptEngine(),
      logger: createNoopAgentLogger(),
    });

    await expect(collectEvents(runtime)).rejects.toThrow(
      /has no access to project/,
    );
  });
});
