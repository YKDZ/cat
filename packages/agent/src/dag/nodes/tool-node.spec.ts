import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

import type {
  AgentToolDefinition,
  ToolExecutionContext,
} from "../../tool/tool-types.ts";

import { createNoopAgentLogger } from "../../observability/agent-logger.ts";
import { ToolRegistry } from "../../tool/tool-registry.ts";
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
          providerId: 123,
          documentId: "11111111-1111-4111-8111-111111111111",
          elementId: 88,
          languageId: "zh-CN",
          sourceLanguageId: "en-US",
        },
        logger: createNoopAgentLogger(),
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
      providerId: 123,
      documentId: "11111111-1111-4111-8111-111111111111",
      elementId: 88,
      languageId: "zh-CN",
      sourceLanguageId: "en-US",
    });
  });
});
