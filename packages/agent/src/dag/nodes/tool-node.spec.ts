import { describe, expect, it, vi } from "vitest";
import { z } from "zod/v4";

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
  it("projects kanban_claim results into current_card_id", async () => {
    const registry = new ToolRegistry();
    registry.register(
      createTool(
        "kanban_claim",
        vi.fn().mockResolvedValue({
          id: 7,
          externalId: "card-ext-7",
          title: "Fix review feedback",
        }),
      ),
    );

    const result = await runToolNode(
      {
        tool_calls: [{ id: "tool-1", name: "kanban_claim", arguments: "{}" }],
        messages: [],
      },
      {
        toolRegistry: registry,
        sessionId: "session-1",
        runId: "run-1",
        agentId: "agent-1",
        projectId: "project-1",
        sessionMetadata: {
          kanbanBoardId: 99,
        },
        logger: createNoopAgentLogger(),
      },
    );

    expect(result.updates.current_card_id).toBe("card-ext-7");
    expect(result.updates.messages).toEqual([
      {
        role: "tool",
        content: JSON.stringify({
          id: 7,
          externalId: "card-ext-7",
          title: "Fix review feedback",
        }),
        toolCallId: "tool-1",
      },
    ]);
  });

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
          kanbanBoardId: 99,
          kanbanCardId: 7,
          documentId: "11111111-1111-4111-8111-111111111111",
          elementId: 88,
          languageId: "zh-CN",
          sourceLanguageId: "en-US",
        },
        logger: createNoopAgentLogger(),
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
      kanbanBoardId: 99,
      kanbanCardId: 7,
      documentId: "11111111-1111-4111-8111-111111111111",
      elementId: 88,
      languageId: "zh-CN",
      sourceLanguageId: "en-US",
    });
  });
});
