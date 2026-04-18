import type { GraphDefinition } from "@cat/graph";
import type { PluginManager } from "@cat/plugin-core";
import type {
  AgentConstraints,
  AgentSessionMetadata,
} from "@cat/shared/schema/agent";

import type { LLMGateway } from "../llm/llm-gateway.ts";
import type { AgentLogger } from "../observability/agent-logger.ts";
import type { PromptEngine } from "../prompt/prompt-engine.ts";
import type { ToolRegistry } from "../tool/tool-registry.ts";

// ─── Shared Blackboard Data Schema ───────────────────────────────────────────

/**
 * @zh Agent DAG 使用的 Blackboard 数据结构（存储于 Blackboard.data 中）。
 * @en Blackboard data structure used by the Agent DAG (stored in Blackboard.data).
 */
export interface AgentBlackboardData {
  /** @zh 对话消息历史 @en Conversation message history */
  messages: Array<{
    role: "system" | "user" | "assistant" | "tool";
    content: string | null;
    toolCallId?: string;
    toolCalls?: Array<{ id: string; name: string; arguments: string }>;
  }>;
  /** @zh LLM 最新一轮文本输出 @en Latest LLM text output */
  output_snapshot?: string;
  /** @zh LLM 最新一轮工具调用列表 @en Latest LLM tool call list */
  tool_calls?: Array<{ id: string; name: string; arguments: string }>;
  /** @zh 工具调用结果列表 @en Tool call result list */
  tool_results?: Array<{ toolCallId: string; content: string }>;
  /** @zh finish 工具是否被调用 @en Whether the finish tool was called */
  finish_called?: boolean;
  /** @zh finish 的原因 @en Reason for finish */
  finish_reason?: string;
  /** @zh 累计 Token 用量 @en Accumulated token usage */
  token_usage?: {
    promptTokens: number;
    completionTokens: number;
  };
  /** @zh 当前轮次（从 0 开始）@en Current turn (zero-based) */
  current_turn?: number;
  /** @zh Agent Run 开始时间（ISO）@en Agent run start time (ISO) */
  started_at?: string;
  /** @zh Agent 工作本内容 @en Agent scratchpad content */
  scratchpad?: string;
  /** @zh PreCheckNode 写入的提示 @en Notes written by PreCheckNode */
  precheck_notes?: string;
}

// ─── Agent Node Context ───────────────────────────────────────────────────────

/**
 * @zh 所有 Agent DAG 节点的共享执行上下文。
 * @en Shared execution context for all Agent DAG nodes.
 */
export interface AgentNodeContext {
  /** @zh Agent 会话外部 UUID @en Agent session external UUID */
  sessionId: string;
  /** @zh Agent 运行外部 UUID @en Agent run external UUID */
  runId: string;
  /** @zh Agent 定义外部 UUID @en Agent definition external UUID */
  agentId: string;
  /** @zh 项目外部 UUID @en Project external UUID */
  projectId: string;
  /** @zh 会话级业务上下文元数据 @en Session-scoped business context metadata */
  sessionMetadata: AgentSessionMetadata | null;
  /** @zh Prompt 变量映射 @en Prompt variable map */
  promptVariables: Record<string, string>;
  /** @zh LLM 调用网关 @en LLM call gateway */
  llmGateway: LLMGateway;
  /** @zh 工具注册表 @en Tool registry */
  toolRegistry: ToolRegistry;
  /** @zh Prompt 构建引擎 @en Prompt construction engine */
  promptEngine: PromptEngine;
  /** @zh Agent 运行时约束（来自 agentSession 快照）@en Agent runtime constraints (from agentSession snapshot) */
  constraints: AgentConstraints;
  /** @zh 运行开始时间 @en Run start time */
  startedAt: Date;
  /** @zh 结构化日志 @en Structured logger */
  logger: AgentLogger;
  /**
   * @zh 当前作用域的插件管理器
   * @en Scoped plugin manager
   */
  pluginManager?: PluginManager;
  /** @zh 实时事件发射回调（可选），用于 thinking delta 转发 @en Optional real-time event callback for thinking delta forwarding */
  emitEvent?: (event: {
    type: string;
    payload: Record<string, unknown>;
  }) => void;
  /**
   * @zh VCS 模式，通过 determineWriteMode() 动态计算
   * @en VCS mode, dynamically computed via determineWriteMode()
   */
  vcsMode: "direct" | "isolation";
  /**
   * @zh 权限检查函数，使用真实权限引擎进行检查
   * @en Permission checker using the real permission engine
   */
  permissionChecker: (action: string, resource: string) => Promise<boolean>;
}

// ─── Agent DAG Builder ────────────────────────────────────────────────────────

/**
 * @zh 构建 Agent DAG 图定义（PreCheck → Reasoning → Tool/Decision → 循环）。
 *
 * 此定义用于 Schema 校验和 GraphRegistry，实际执行逻辑由 AgentRuntime 以命令式
 * 方式调用各节点函数实现。
 *
 * @en Build the Agent DAG graph definition (PreCheck → Reasoning → Tool/Decision → loop).
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
