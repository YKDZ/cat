import type { PluginManager } from "@cat/plugin-core";
import type { NonNullJSONType } from "@cat/shared/schema/json";
import type { VCSContext, VCSMiddleware } from "@cat/vcs";
import type * as z from "zod/v4";

import type { EventEnvelopeInput } from "@/graph/events";
import type {
  BlackboardSnapshot,
  EdgeDefinition,
  GraphDefinition,
  NodeType,
  RetryConfig,
} from "@/graph/types";

// ─── 类型安全节点上下文 ──────────────────────────────────────────────

/** Step handler 执行时注入的上下文 */
export type TypedNodeContext = {
  runId: string;
  nodeId: string;
  signal?: AbortSignal;
  /** Alias for runId – supplied for compatibility with OperationContext */
  traceId: string;
  /** Plugin manager instance from the graph runtime */
  pluginManager: PluginManager;
  emit: (event: EventEnvelopeInput) => Promise<void>;
  /** Buffer an event to be published after node execution */
  addEvent: (event: EventEnvelopeInput) => void;
  /** Check whether a side-effect has already been recorded for this run+key */
  checkSideEffect: <T extends NonNullJSONType>(
    key: string,
  ) => Promise<T | null>;
  /** Record a side-effect for idempotency; returns null on first call */
  recordSideEffect: <T extends NonNullJSONType>(
    key: string,
    outputType: "db_write" | "api_call" | "event_publish",
    payload: T,
  ) => Promise<T | null>;
  /**
   * @zh 可选的 VCS 上下文。当提供时，graph 节点应通过 executeWithVCS 记录写操作。
   * @en Optional VCS context. When provided, graph nodes should use executeWithVCS for writes.
   */
  vcsContext?: VCSContext;
  /**
   * @zh VCS 中间件实例。与 vcsContext 配对使用。
   * @en VCS middleware instance. Used alongside vcsContext.
   */
  vcsMiddleware?: VCSMiddleware;
};

// ─── 类型安全节点定义 ──────────────────────────────────────────────

/** 一个类型安全的节点声明 */
export type TypedNodeDef<
  TInput extends z.ZodType = z.ZodType,
  TOutput extends z.ZodType = z.ZodType,
> = {
  /** 节点类型，默认 transform */
  type?: NodeType;
  /** 节点输入 schema — 从 Blackboard 中按 key 读取 */
  input: TInput;
  /** 节点输出 schema — 写回 Blackboard 的数据 */
  output: TOutput;
  /** 执行函数 */
  handler: (
    input: z.infer<TInput>,
    ctx: TypedNodeContext,
  ) => Promise<z.infer<TOutput>>;
  /** 输入数据来源映射：{ handlerParamKey: "blackboard.path" } */
  inputMapping?: Record<string, string>;
  /** 输出写回映射：{ "blackboard.path": "handlerOutputKey" } */
  outputMapping?: Record<string, string>;
  /** 超时 ms */
  timeoutMs?: number;
  /** 重试配置 */
  retry?: RetryConfig;
};

// ─── 类型安全图定义 ──────────────────────────────────────────────

/** defineTypedGraph 的选项 */
export type TypedGraphOptions<
  TInput extends z.ZodType,
  TOutput extends z.ZodType,
  TNodes extends Record<string, TypedNodeDef>,
> = {
  id: string;
  version?: string;
  description?: string;
  /** 整个图的输入 schema（对应 Blackboard 初始数据） */
  input: TInput;
  /** 整个图的输出 schema（从 Blackboard 最终状态提取） */
  output: TOutput;
  /** 类型安全节点声明 */
  nodes: TNodes;
  /** 边定义 — from/to 受 TNodes 的 key 约束 */
  edges: Array<{
    from: Extract<keyof TNodes, string>;
    to: Extract<keyof TNodes, string>;
    condition?: EdgeDefinition["condition"];
    label?: string;
  }>;
  /** 入口节点 */
  entry: Extract<keyof TNodes, string>;
  /** 出口节点 */
  exit?: Array<Extract<keyof TNodes, string>>;
  /** 图级别配置项 */
  config?: GraphDefinition["config"];
};

/** defineTypedGraph 的返回值 */
export type TypedGraphDefinition<
  TInput extends z.ZodType,
  TOutput extends z.ZodType,
> = {
  /** Graph ID */
  id: string;
  /** 标准 GraphDefinition，可直接注册到 GraphRegistry */
  graphDefinition: GraphDefinition;
  /** 输入 schema，用于 oRPC 端点的 input 校验 */
  inputSchema: TInput;
  /** 输出 schema，用于从 Blackboard 提取结果 */
  outputSchema: TOutput;
  /** 从 Blackboard 最终快照中提取类型安全结果 */
  extractResult: (snapshot: BlackboardSnapshot) => z.infer<TOutput>;
};
