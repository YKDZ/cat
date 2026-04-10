import type { ChatMessage, LLMChunk, ToolCall } from "@cat/plugin-core";

import type {
  AgentBlackboardData,
  AgentNodeContext,
} from "../agent-dag-builder.ts";

// ─── Collected LLM Response ───────────────────────────────────────────────────

/**
 * @zh 聚合后的 LLM 响应。
 * @en Aggregated LLM response.
 */
export interface CollectedLLMResponse {
  /** @zh 文本输出 @en Text output */
  text: string;
  /** @zh 工具调用列表 @en Tool call list */
  toolCalls: Array<{ id: string; name: string; arguments: string }>;
  /** @zh 完成原因 @en Finish reason */
  finishReason: string;
  /** @zh Token 用量 @en Token usage */
  tokenUsage: { promptTokens: number; completionTokens: number };
}

/**
 * @zh 消费 AsyncIterable<LLMChunk> 流，聚合为完整的 LLM 响应。
 * @en Consume AsyncIterable<LLMChunk> stream and aggregate into a complete LLM response.
 *
 * @param stream - {@zh LLM 流式输出} {@en LLM streaming output}
 * @returns - {@zh 聚合后的 LLM 响应} {@en Aggregated LLM response}
 * @throws - {@zh LLM 流出现 error chunk 时抛出} {@en Throws when an error chunk appears in the stream}
 */
export const collectLLMResponse = async (
  stream: AsyncIterable<LLMChunk>,
): Promise<CollectedLLMResponse> => {
  let text = "";
  const toolCallsMap = new Map<
    string,
    { id: string; name: string; arguments: string }
  >();
  let finishReason = "stop";
  let promptTokens = 0;
  let completionTokens = 0;

  for await (const chunk of stream) {
    switch (chunk.type) {
      case "text_delta":
        text += chunk.textDelta;
        break;
      case "tool_call_delta": {
        const { id, name, argumentsDelta } = chunk.toolCallDelta;
        if (!toolCallsMap.has(id)) {
          toolCallsMap.set(id, { id, name: name ?? "", arguments: "" });
        }
        const tc = toolCallsMap.get(id)!;
        if (name) tc.name = name;
        if (argumentsDelta) tc.arguments += argumentsDelta;
        break;
      }
      case "finish":
        finishReason = chunk.finishReason;
        break;
      case "usage":
        promptTokens = chunk.usage.promptTokens;
        completionTokens = chunk.usage.completionTokens;
        break;
      case "error":
        throw chunk.error;
      case "thinking_delta":
        // Phase 0a: thinking deltas are intentionally ignored
        break;
      default:
        break;
    }
  }

  return {
    text,
    toolCalls: Array.from(toolCallsMap.values()),
    finishReason,
    tokenUsage: { promptTokens, completionTokens },
  };
};

// ─── Result ───────────────────────────────────────────────────────────────────

/**
 * @zh ReasoningNode 执行结果。
 * @en ReasoningNode execution result.
 */
export interface ReasoningNodeResult {
  /** @zh LLM 文本输出 @en LLM text output */
  text: string;
  /** @zh 是否有工具调用 @en Whether there are tool calls */
  hasToolCalls: boolean;
  /** @zh Token 用量 @en Token usage */
  tokenUsage: { promptTokens: number; completionTokens: number };
  /** @zh Blackboard data 更新 @en Blackboard data updates */
  updates: Partial<AgentBlackboardData>;
}

// ─── ReasoningNode ────────────────────────────────────────────────────────────

/**
 * @zh ReasoningNode：读取 Blackboard 消息历史，调用 LLMGateway，
 * 聚合响应后将工具调用和输出快照写回 Blackboard。
 *
 * @en ReasoningNode: reads message history from Blackboard, calls LLMGateway,
 * aggregates the response, then writes tool calls and output snapshot back to Blackboard.
 *
 * @param data - {@zh 当前 Blackboard 数据} {@en Current Blackboard data}
 * @param ctx - {@zh Agent 节点上下文} {@en Agent node context}
 * @param definition - {@zh 已解析的 Agent 定义（含 tools 列表和 llm 配置）} {@en Parsed agent definition (with tools and llm config)}
 * @returns - {@zh ReasoningNodeResult} {@en ReasoningNodeResult}
 */
export const runReasoningNode = async (
  data: AgentBlackboardData,
  ctx: AgentNodeContext,
  definition: {
    content: string;
    metadata: {
      tools: string[];
      llm?: { temperature?: number; maxTokens?: number };
    };
  },
): Promise<ReasoningNodeResult> => {
  const { llmGateway, toolRegistry, promptEngine, sessionId, logger } = ctx;
  const startMs = Date.now();

  logger.logDAGNode({
    nodeType: "reasoning",
    status: "started",
    message: "ReasoningNode: building prompt",
  });

  // Build prompt from Blackboard data and agent definition
  const builtPrompt = promptEngine.buildPrompt({
    agentDefinition: {
      // oxlint-disable-next-line no-unsafe-type-assertion -- structural subtype cast for prompt engine API
      metadata: definition.metadata as Parameters<
        typeof promptEngine.buildPrompt
      >[0]["agentDefinition"]["metadata"],
      content: definition.content,
    },
    messages: (data.messages ?? []) as ChatMessage[],
    scratchpad: data.scratchpad,
    precheckNotes: data.precheck_notes,
    costStatus: {
      remainingTokens: 999_999, // Phase 0a: always report high
      budgetId: sessionId,
    },
  });

  // Convert tool names to LLM tool definitions
  const llmTools = toolRegistry.toLLMTools(definition.metadata.tools);

  logger.logDAGNode({
    nodeType: "reasoning",
    status: "started",
    message: `ReasoningNode: calling LLM with ${builtPrompt.messages.length} messages and ${llmTools.length} tools`,
  });

  // Call LLM via gateway
  // oxlint-disable-next-line await-thenable -- async generator method; await is effectively identity but needed for mock compatibility
  const stream = await llmGateway.chat({
    request: {
      messages: builtPrompt.messages,
      tools: llmTools.length > 0 ? llmTools : undefined,
      temperature: definition.metadata.llm?.temperature,
      maxTokens: definition.metadata.llm?.maxTokens,
    },
  });

  // Collect response
  const response = await collectLLMResponse(stream);
  const durationMs = Date.now() - startMs;

  logger.logLLMCall({
    providerId: "unknown",
    modelName: "unknown",
    promptTokens: response.tokenUsage.promptTokens,
    completionTokens: response.tokenUsage.completionTokens,
    durationMs,
    finishReason: response.finishReason,
    message: `LLM call completed: finish=${response.finishReason}, tools=${response.toolCalls.length}`,
  });

  // Build the assistant message to append to history
  const assistantMessage: ChatMessage = {
    role: "assistant",
    content: response.text || null,
    toolCalls:
      response.toolCalls.length > 0
        ? (response.toolCalls.map((tc) => ({
            id: tc.id,
            name: tc.name,
            arguments: tc.arguments,
          })) as ToolCall[])
        : undefined,
  };

  const existingMessages = (data.messages ?? []) as ChatMessage[];

  // Accumulate token usage
  const prevUsage = data.token_usage ?? {
    promptTokens: 0,
    completionTokens: 0,
  };

  logger.logDAGNode({
    nodeType: "reasoning",
    status: "completed",
    message: `ReasoningNode: hasToolCalls=${response.toolCalls.length > 0}, tokens=${response.tokenUsage.promptTokens}+${response.tokenUsage.completionTokens}`,
    durationMs,
  });

  return {
    text: response.text,
    hasToolCalls: response.toolCalls.length > 0,
    tokenUsage: response.tokenUsage,
    updates: {
      messages: [...existingMessages, assistantMessage],
      tool_calls: response.toolCalls.length > 0 ? response.toolCalls : [],
      tool_results: [], // reset previous tool results
      output_snapshot: response.text,
      token_usage: {
        promptTokens: prevUsage.promptTokens + response.tokenUsage.promptTokens,
        completionTokens:
          prevUsage.completionTokens + response.tokenUsage.completionTokens,
      },
    },
  };
};

export type { AgentNodeContext };
