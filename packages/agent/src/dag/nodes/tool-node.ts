import type { ChatMessage } from "@cat/plugin-core";

import type { ToolExecutionContext } from "../../tool/tool-types.ts";
import type {
  AgentBlackboardData,
  AgentNodeContext,
} from "../agent-dag-builder.ts";

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null && !Array.isArray(value);
};

// ─── Result ───────────────────────────────────────────────────────────────────

/**
 * @zh ToolNode 执行结果。
 * @en ToolNode execution result.
 */
export interface ToolNodeResult {
  /** @zh 工具执行结果（用于追加到消息历史）@en Tool results (to append to message history) */
  toolResults: Array<{ toolCallId: string; content: string }>;
  /** @zh 是否调用了 finish 工具 @en Whether the finish tool was called */
  finishCalled: boolean;
  /** @zh Blackboard data 更新 @en Blackboard data updates */
  updates: Partial<AgentBlackboardData>;
}

// ─── ToolNode ─────────────────────────────────────────────────────────────────

/**
 * @zh ToolNode：从 Blackboard 读取工具调用列表，并发执行所有工具，将结果写回 Blackboard。
 *
 * @en ToolNode: reads tool call list from Blackboard, executes all tools concurrently,
 * and writes results back to Blackboard.
 *
 * @param data - {@zh 当前 Blackboard 数据} {@en Current Blackboard data}
 * @param ctx - {@zh Agent 节点上下文} {@en Agent node context}
 * @returns - {@zh ToolNodeResult} {@en ToolNodeResult}
 */
export const runToolNode = async (
  data: AgentBlackboardData,
  ctx: Pick<
    AgentNodeContext,
    | "toolRegistry"
    | "sessionId"
    | "runId"
    | "agentId"
    | "projectId"
    | "sessionMetadata"
    | "logger"
    | "pluginManager"
  >,
): Promise<ToolNodeResult> => {
  const {
    toolRegistry,
    sessionId,
    runId,
    agentId,
    projectId,
    sessionMetadata,
    logger,
    pluginManager,
  } = ctx;
  const toolCalls = data.tool_calls ?? [];

  if (toolCalls.length === 0) {
    return {
      toolResults: [],
      finishCalled: false,
      updates: { tool_results: [] },
    };
  }

  logger.logDAGNode({
    nodeType: "tool",
    status: "started",
    message: `ToolNode: executing ${toolCalls.length} tool call(s): ${toolCalls.map((tc) => tc.name).join(", ")}`,
  });

  // Build ToolExecutionContext
  const toolCtx: ToolExecutionContext = {
    session: {
      sessionId,
      agentId,
      projectId,
      runId,
      providerId: sessionMetadata?.providerId,
      kanbanBoardId: sessionMetadata?.kanbanBoardId,
      kanbanCardId: sessionMetadata?.kanbanCardId,
      documentId: sessionMetadata?.documentId,
      elementId: sessionMetadata?.elementId,
      languageId: sessionMetadata?.languageId,
      sourceLanguageId: sessionMetadata?.sourceLanguageId,
    },
    permissions: {
      checkPermission: async () => true, // Phase 0a: allow all
    },
    cost: {
      budgetId: sessionId,
      remainingTokens: 999_999,
    },
    vcsMode: "trust",
    pluginManager,
  };

  // Execute all tool calls concurrently
  const results = await Promise.allSettled(
    toolCalls.map(async (tc) => {
      const startMs = Date.now();
      logger.logToolExecute({
        toolName: tc.name,
        status: "started",
        message: `Executing tool: ${tc.name}`,
      });

      let args: Record<string, unknown>;
      try {
        // oxlint-disable-next-line no-unsafe-type-assertion -- JSON.parse returns unknown; cast is safe after try/catch
        args = JSON.parse(tc.arguments) as Record<string, unknown>;
      } catch {
        args = {};
      }

      const result = await toolRegistry.execute(tc.name, args, toolCtx);
      const durationMs = Date.now() - startMs;

      logger.logToolExecute({
        toolName: tc.name,
        status: "completed",
        durationMs,
        message: `Tool ${tc.name} completed in ${durationMs}ms`,
      });

      return {
        toolCallId: tc.id,
        content: JSON.stringify(result),
        rawResult: result,
        name: tc.name,
      };
    }),
  );

  const toolResults: Array<{ toolCallId: string; content: string }> = [];
  let finishCalled = false;
  let claimedCardExternalId: string | null = null;

  for (let i = 0; i < results.length; i += 1) {
    const outcome = results[i];
    const tc = toolCalls[i];

    if (outcome.status === "fulfilled") {
      toolResults.push({
        toolCallId: outcome.value.toolCallId,
        content: outcome.value.content,
      });
      if (tc.name === "finish") {
        finishCalled = true;
      }
      if (
        tc.name === "kanban_claim" &&
        isRecord(outcome.value.rawResult) &&
        typeof outcome.value.rawResult["externalId"] === "string"
      ) {
        claimedCardExternalId = outcome.value.rawResult["externalId"];
      }
    } else {
      const errorMsg =
        outcome.reason instanceof Error
          ? outcome.reason.message
          : String(outcome.reason);
      logger.logToolExecute({
        toolName: tc.name,
        status: "failed",
        message: `Tool ${tc.name} failed: ${errorMsg}`,
      });
      toolResults.push({
        toolCallId: tc.id,
        content: JSON.stringify({ error: errorMsg }),
      });
    }
  }

  // Build tool-result messages to append to history
  const toolResultMessages: ChatMessage[] = toolResults.map((tr) => ({
    role: "tool" as const,
    content: tr.content,
    toolCallId: tr.toolCallId,
  }));

  const existingMessages = (data.messages as ChatMessage[]) ?? [];

  logger.logDAGNode({
    nodeType: "tool",
    status: "completed",
    message: `ToolNode: completed ${toolResults.length} result(s), finishCalled=${finishCalled}`,
  });

  return {
    toolResults,
    finishCalled,
    updates: {
      tool_results: toolResults,
      finish_called: finishCalled || data.finish_called,
      current_card_id: claimedCardExternalId ?? data.current_card_id,
      messages: [...existingMessages, ...toolResultMessages],
    },
  };
};
