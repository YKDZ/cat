import type { ZodObject, ZodRawShape } from "zod/v4";

/**
 * @zh 工具的副作用类型
 * @en The side-effect type of a tool
 */
export type SideEffectType = "none" | "internal" | "external" | "mixed";

/**
 * @zh 工具的安全级别
 * @en Security level required to execute a tool
 */
export type ToolSecurityLevel = "standard" | "privileged" | "administrative";

/**
 * @zh 工具执行上下文：提供 Session、权限检查、成本状态和 VCS 模式信息。
 * @en Tool execution context: provides session, permission checks, cost status, and VCS mode.
 */
export interface ToolExecutionContext {
  /** @zh 当前 Agent 会话标识 @en Current agent session identifiers */
  session: {
    sessionId: string;
    agentId: string;
    projectId: string;
  };
  /** @zh 权限检查接口 @en Permission checking interface */
  permissions: {
    checkPermission: (action: string, resource: string) => Promise<boolean>;
  };
  /** @zh 成本/配额预算信息 @en Cost/quota budget information */
  cost: {
    budgetId: string;
    remainingTokens: number;
  };
  /**
   * @zh VCS 模式
   * - `trust`: 直接写入 VCS（信任模式）
   * - `audit`: 写入后需人工审计
   * - `isolation`: 写入沙盒，不影响主干
   * @en VCS mode
   */
  vcsMode: "trust" | "audit" | "isolation";
}

/**
 * @zh Agent 工具定义。每个工具声明名称、描述、参数 Schema、副作用类型、安全级别和执行函数。
 * @en Agent tool definition. Each tool declares its name, description, parameter schema, side-effect type, security level, and execution function.
 */
export interface AgentToolDefinition {
  /** @zh 工具唯一名称（用作 LLM function name）@en Unique tool name (used as LLM function name) */
  name: string;
  /** @zh 工具描述（用于 LLM 上下文）@en Tool description (used for LLM context) */
  description: string;
  /** @zh 参数 Zod Schema（自动转换为 JSON Schema 传给 LLM）@en Parameter Zod schema (auto-converted to JSON Schema for LLM) */
  parameters: ZodObject<ZodRawShape>;
  /** @zh 副作用类型 @en Side-effect type */
  sideEffectType: SideEffectType;
  /** @zh 安全级别 @en Security level */
  toolSecurityLevel: ToolSecurityLevel;
  /** @zh 工具执行函数 @en Tool execution function */
  execute: (
    args: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ) => Promise<unknown>;
  /**
   * @zh 批量执行提示：声明该工具通常与哪些其他工具同时调用。
   * @en Batch execution hint: declares which other tools are commonly called alongside this one.
   */
  batchHint?: {
    commonCompanions: string[];
    description: string;
  };
}
