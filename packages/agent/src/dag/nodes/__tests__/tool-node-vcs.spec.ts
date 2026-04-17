/**
 * @zh ToolNode vcsMode 动态传递单元测试。
 * @en Unit tests for dynamic vcsMode passing in ToolNode.
 */

import { describe, expect, it, vi } from "vitest";

import type { ToolRegistry } from "../../../tool/tool-registry.ts";
import type { ToolExecutionContext } from "../../../tool/tool-types.ts";

import { createNoopAgentLogger } from "../../../observability/agent-logger.ts";
import { runToolNode } from "../tool-node.ts";

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Build a minimal mock ToolRegistry that captures the ToolExecutionContext
 * passed to `execute`, and records it for assertion.
 */
function makeMockRegistry(): {
  registry: ToolRegistry;
  capturedCtx: () => ToolExecutionContext | undefined;
} {
  let captured: ToolExecutionContext | undefined;

  // oxlint-disable-next-line no-unsafe-type-assertion -- partial mock, only execute() is used
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
  } as unknown as ToolRegistry;

  return { registry, capturedCtx: () => captured };
}

/** Minimal AgentBlackboardData with one tool call. */
const dataWithToolCall = {
  messages: [],
  tool_calls: [
    {
      id: "tc-1",
      name: "some-tool",
      arguments: "{}",
    },
  ],
};

/** Shared base ctx fields. */
const baseCtx = {
  sessionId: "session-1",
  runId: "run-1",
  agentId: "agent-1",
  projectId: "project-1",
  sessionMetadata: null,
  logger: createNoopAgentLogger(),
  pluginManager: undefined,
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("runToolNode — vcsMode propagation", () => {
  it('passes vcsMode "isolation" to ToolExecutionContext when ctx.vcsMode is "isolation"', async () => {
    const { registry, capturedCtx } = makeMockRegistry();

    await runToolNode(dataWithToolCall, {
      ...baseCtx,
      toolRegistry: registry,
      vcsMode: "isolation",
      permissionChecker: async () => true,
    });

    expect(capturedCtx()?.vcsMode).toBe("isolation");
  });

  it('passes vcsMode "trust" to ToolExecutionContext when ctx.vcsMode is "trust"', async () => {
    const { registry, capturedCtx } = makeMockRegistry();

    await runToolNode(dataWithToolCall, {
      ...baseCtx,
      toolRegistry: registry,
      vcsMode: "trust",
      permissionChecker: async () => true,
    });

    expect(capturedCtx()?.vcsMode).toBe("trust");
  });

  it("passes permissionChecker to ToolExecutionContext.permissions.checkPermission", async () => {
    const { registry, capturedCtx } = makeMockRegistry();
    const denyAll = async (): Promise<boolean> => false;

    await runToolNode(dataWithToolCall, {
      ...baseCtx,
      toolRegistry: registry,
      vcsMode: "trust",
      permissionChecker: denyAll,
    });

    const ctx = capturedCtx();
    expect(ctx).toBeDefined();
    const result = await ctx!.permissions.checkPermission("editor", "project");
    expect(result).toBe(false);
  });
});
