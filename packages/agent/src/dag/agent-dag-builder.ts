import type { GraphDefinition } from "@cat/graph";
import type { PluginManager } from "@cat/plugin-core";
import type { AgentConstraints, AgentSessionMetadata } from "@cat/shared";

import type { LLMGateway } from "../llm/llm-gateway.ts";
import type { AgentLogger } from "../observability/agent-logger.ts";
import type { PromptEngine } from "../prompt/prompt-engine.ts";
import type { ToolRegistry } from "../tool/tool-registry.ts";

// ─── Shared Blackboard Data Schema ───────────────────────────────────────────

/**
 * Blackboard data structure used by the Agent DAG (stored in Blackboard.data).
 */
export interface AgentBlackboardData {
  /** Conversation message history */
  messages: Array<{
    role: "system" | "user" | "assistant" | "tool";
    content: string | null;
    toolCallId?: string;
    toolCalls?: Array<{ id: string; name: string; arguments: string }>;
    /** Thinking-mode reasoning text (e.g. mimo, DeepSeek R1) — must be echoed back in subsequent requests */
    reasoningContent?: string;
  }>;
  /** Latest LLM text output */
  output_snapshot?: string;
  /** Latest LLM tool call list */
  tool_calls?: Array<{ id: string; name: string; arguments: string }>;
  /** Tool call result list */
  tool_results?: Array<{ toolCallId: string; content: string }>;
  /** Whether the finish tool was called */
  finish_called?: boolean;
  /** Reason for finish */
  finish_reason?: string;
  /** Accumulated token usage */
  token_usage?: {
    promptTokens: number;
    completionTokens: number;
  };
  /** Current turn (zero-based) */
  current_turn?: number;
  /** Agent run start time (ISO) */
  started_at?: string;
  /** Agent scratchpad content */
  scratchpad?: string;
  /** Notes written by PreCheckNode */
  precheck_notes?: string;
}

// ─── Agent Node Context ───────────────────────────────────────────────────────

/**
 * Shared execution context for all Agent DAG nodes.
 */
export interface AgentNodeContext {
  /** Agent session external UUID */
  sessionId: string;
  /** Agent run external UUID */
  runId: string;
  /** Agent definition external UUID */
  agentId: string;
  /** Project external UUID */
  projectId: string;
  /** Session-scoped business context metadata */
  sessionMetadata: AgentSessionMetadata | null;
  /** Prompt variable map */
  promptVariables: Record<string, string>;
  /** LLM call gateway */
  llmGateway: LLMGateway;
  /** Tool registry */
  toolRegistry: ToolRegistry;
  /** Prompt construction engine */
  promptEngine: PromptEngine;
  /** Agent runtime constraints (from agentSession snapshot) */
  constraints: AgentConstraints;
  /** Run start time */
  startedAt: Date;
  /** Structured logger */
  logger: AgentLogger;
  /**
   * Scoped plugin manager
   */
  pluginManager?: PluginManager;
  /** Optional real-time event callback for thinking delta forwarding */
  emitEvent?: (event: {
    type: string;
    payload: Record<string, unknown>;
  }) => void;
  /**
   * VCS mode, dynamically computed via determineWriteMode()
   */
  vcsMode: "direct" | "isolation";
  /**
   * Permission checker using the real permission engine
   */
  permissionChecker: (action: string, resource: string) => Promise<boolean>;
}

// ─── Agent DAG Builder ────────────────────────────────────────────────────────

/**
 *
 * 此定义用于 Schema 校验和 GraphRegistry，实际执行逻辑由 AgentRuntime 以命令式
 * 方式调用各节点函数实现。
 *
 * Build the Agent DAG graph definition (PreCheck → Reasoning → Tool/Decision → loop).
 *
 * This definition is used for schema validation and GraphRegistry.
 * The actual execution logic is implemented imperatively by AgentRuntime calling each node function.
 */
export const buildAgentDAG = (): GraphDefinition => ({
  id: "agent-dag",
  version: "1.0.0",
  description: "Agent DAG: PreCheck → Reasoning → Tool/Decision loop",
  nodes: {
    precheck: { id: "precheck", type: "transform", timeoutMs: 30_000 },
    reasoning: { id: "reasoning", type: "llm", timeoutMs: 120_000 },
    tool: { id: "tool", type: "tool", timeoutMs: 60_000 },
    decision: { id: "decision", type: "router", timeoutMs: 10_000 },
  },
  edges: [
    { from: "precheck", to: "reasoning" },
    {
      from: "reasoning",
      to: "tool",
      condition: { field: "hasToolCalls", operator: "eq", value: true },
    },
    {
      from: "reasoning",
      to: "decision",
      condition: { field: "hasToolCalls", operator: "eq", value: false },
    },
    { from: "tool", to: "decision" },
    {
      from: "decision",
      to: "precheck",
      condition: { field: "shouldContinue", operator: "eq", value: true },
    },
  ],
  entry: "precheck",
  exit: ["decision"],
});

export type { AgentConstraints };
