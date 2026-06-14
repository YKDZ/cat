import type { PluginManager } from "@cat/plugin-core";
import type { ZodObject } from "zod";

/**
 * The side-effect type of a tool
 */
export type SideEffectType = "none" | "internal" | "external" | "mixed";

/**
 * Security level required to execute a tool
 */
export type ToolSecurityLevel = "standard" | "privileged" | "administrative";

/**
 * Tool execution context: provides session, permission checks, cost status, and VCS mode.
 */
export interface ToolExecutionContext {
  /** Current agent session identifiers */
  session: {
    sessionId: string;
    agentId: string;
    projectId: string;
    runId: string;
    providerId?: number;
    branchId?: number;
    contentNodeIds?: string[];
    currentElementContentNodeId?: string;
    elementId?: number;
    languageId?: string;
    sourceLanguageId?: string;
    issueId?: number;
    pullRequestId?: number;
  };
  /** Permission checking interface */
  permissions: {
    checkPermission: (action: string, resource: string) => Promise<boolean>;
  };
  /** Cost/quota budget information */
  cost: {
    budgetId: string;
    remainingTokens: number;
  };
  /**
   * - `direct`: 直接写入并记录变更（Direct 模式）
   * - `isolation`: 写入沙盒，不影响主干
   * VCS mode
   */
  vcsMode: "direct" | "isolation";
  /**
   * Scoped plugin manager (optional; tools should degrade gracefully when absent)
   */
  pluginManager?: PluginManager;
}

/**
 * Agent tool definition. Each tool declares its name, description, parameter schema, side-effect type, security level, and execution function.
 */
export interface AgentToolDefinition {
  /** Unique tool name (used as LLM function name) */
  name: string;
  /** Tool description (used for LLM context) */
  description: string;
  /** Parameter Zod schema (auto-converted to JSON Schema for LLM) */
  parameters: ZodObject;
  /** Side-effect type */
  sideEffectType: SideEffectType;
  /** Security level */
  toolSecurityLevel: ToolSecurityLevel;
  /** Tool execution function */
  execute: (
    args: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ) => Promise<unknown>;
  /**
   * Batch execution hint: declares which other tools are commonly called alongside this one.
   */
  batchHint?: {
    commonCompanions: string[];
    description: string;
  };
}
