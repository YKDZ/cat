import { ServiceImplementationReferenceSchema } from "@cat/shared";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { createNoopAgentLogger } from "../../observability/agent-logger.ts";
import { ToolRegistry } from "../../tool/tool-registry.ts";
import type {
  AgentToolDefinition,
  ToolExecutionContext,
} from "../../tool/tool-types.ts";
import { runToolNode } from "./tool-node.ts";

const createTool = (
  name: string,
  execute: AgentToolDefinition["execute"],
): AgentToolDefinition => ({
  name,
  description: `Tool ${name}`,
  parameters: z.object({}),
  sideEffectType: "internal",
  toolSecurityLevel: "standard",
  execute,
});

describe("runToolNode", () => {
  it("passes rich session context into tools", async () => {
    let receivedCtx: ToolExecutionContext | null = null;
    const execute = vi.fn(async (_args: Record<string, unknown>, ctx) => {
      receivedCtx = ctx;
      return { ok: true };
    });
    const registry = new ToolRegistry();
    registry.register(createTool("qa_check", execute));

    await runToolNode(
      {
        tool_calls: [{ id: "tool-2", name: "qa_check", arguments: "{}" }],
        messages: [],
      },
      {
        toolRegistry: registry,
        sessionId: "session-1",
        runId: "run-1",
        agentId: "agent-1",
        projectId: "project-1",
        sessionMetadata: {
          provider: ServiceImplementationReferenceSchema.parse({
            pluginId: "test-plugin",
            serviceId: "llm",
            serviceType: "LLM_PROVIDER",
            scopeType: "GLOBAL",
            scopeId: "",
          }),
          branchId: 42,
          contentNodeIds: [
            "22222222-2222-4222-8222-222222222222",
            "33333333-3333-4333-8333-333333333333",
          ],
          currentElementContentNodeId: "44444444-4444-4444-8444-444444444444",
          elementId: 88,
          languageId: "zh-CN",
          sourceLanguageId: "en-US",
        },
        logger: createNoopAgentLogger(),
        signal: new AbortController().signal,
        vcsMode: "direct",
        permissionChecker: async () => true,
      },
    );

    expect(receivedCtx).not.toBeNull();

    if (!receivedCtx) {
      throw new Error("Expected tool execution context to be captured");
    }

    const capturedCtx: ToolExecutionContext = receivedCtx;

    expect(capturedCtx.session).toEqual({
      sessionId: "session-1",
      agentId: "agent-1",
      projectId: "project-1",
      runId: "run-1",
      provider: expect.objectContaining({ serviceId: "llm" }),
      branchId: 42,
      contentNodeIds: [
        "22222222-2222-4222-8222-222222222222",
        "33333333-3333-4333-8333-333333333333",
      ],
      currentElementContentNodeId: "44444444-4444-4444-8444-444444444444",
      elementId: 88,
      languageId: "zh-CN",
      sourceLanguageId: "en-US",
    });
  });

  it("preserves the failed outcome when a mutating tool observes abort", async () => {
    const controller = new AbortController();
    const cause = new Error("tool cancelled");
    const registry = new ToolRegistry();
    registry.register(
      createTool(
        "blocking",
        async (_args, ctx) =>
          await new Promise((_, reject) => {
            ctx.signal.addEventListener(
              "abort",
              () => reject(ctx.signal.reason),
              {
                once: true,
              },
            );
          }),
      ),
    );
    const operation = runToolNode(
      {
        messages: [],
        tool_calls: [{ id: "tool-1", name: "blocking", arguments: "{}" }],
      },
      {
        toolRegistry: registry,
        sessionId: "session-1",
        runId: "run-1",
        agentId: "agent-1",
        projectId: "project-1",
        sessionMetadata: null,
        logger: createNoopAgentLogger(),
        signal: controller.signal,
        vcsMode: "direct",
        permissionChecker: async () => true,
      },
    );
    controller.abort(cause);

    const errorContent = JSON.stringify({ error: cause.message });
    await expect(operation).resolves.toMatchObject({
      toolResults: [{ toolCallId: "tool-1", content: errorContent }],
      updates: {
        tool_results: [{ toolCallId: "tool-1", content: errorContent }],
        messages: [
          { role: "tool", toolCallId: "tool-1", content: errorContent },
        ],
      },
    });
  });

  it("preserves the committed outcome when abort arrives during a mutating tool", async () => {
    const controller = new AbortController();
    let markStarted: (() => void) | undefined;
    let settleMutation: (() => void) | undefined;
    const started = new Promise<void>((resolve) => {
      markStarted = resolve;
    });
    const mutation = new Promise<void>((resolve) => {
      settleMutation = resolve;
    });
    const registry = new ToolRegistry();
    registry.register(
      createTool("write", async () => {
        markStarted?.();
        await mutation;
        return { committed: true };
      }),
    );
    const operation = runToolNode(
      {
        messages: [],
        tool_calls: [{ id: "tool-1", name: "write", arguments: "{}" }],
      },
      {
        toolRegistry: registry,
        sessionId: "session-1",
        runId: "run-1",
        agentId: "agent-1",
        projectId: "project-1",
        sessionMetadata: null,
        logger: createNoopAgentLogger(),
        signal: controller.signal,
        vcsMode: "direct",
        permissionChecker: async () => true,
      },
    );

    await started;
    controller.abort(new Error("write cancellation requested"));
    settleMutation?.();

    const content = JSON.stringify({ committed: true });
    await expect(operation).resolves.toMatchObject({
      toolResults: [{ toolCallId: "tool-1", content }],
      updates: {
        tool_results: [{ toolCallId: "tool-1", content }],
        messages: [{ role: "tool", toolCallId: "tool-1", content }],
      },
    });
  });
});
