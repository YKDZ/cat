import type { ZodObject, ZodRawShape } from "zod/v4";

import type { IPluginService } from "@/services/service";

/**
 * Confirmation policy for agent tools. Controls whether the user
 * must approve execution before the tool runs.
 */
export type AgentToolConfirmationPolicy =
  | "auto_allow"
  | "session_trust"
  | "always_confirm";

/**
 * Where the tool executes.
 * - `server` — Backend execution (default).
 * - `client` — Frontend (browser) execution via streaming protocol.
 */
export type AgentToolTarget = "server" | "client";

/**
 * A single tool definition provided by an AGENT_TOOL_PROVIDER plugin service.
 */
export interface AgentToolProviderToolDef {
  /** Unique tool name (also used as the LLM function name). */
  name: string;
  /** Human-readable description for the LLM context. */
  description: string;
  /** Zod schema for parameters — auto-converted to JSON Schema for LLM. */
  parameters: ZodObject<ZodRawShape>;
  /**
   * Server-side execution function. For client tools this should be omitted
   * (the framework handles delegation to the browser).
   */
  execute?: (
    args: Record<string, unknown>,
    ctx: { traceId: string; sessionId: string; signal?: AbortSignal },
  ) => Promise<unknown>;
  /** Where this tool executes. Defaults to `"server"`. */
  target?: AgentToolTarget;
  /** Confirmation policy. Defaults to `"auto_allow"`. */
  confirmationPolicy?: AgentToolConfirmationPolicy;
  /** Per-tool timeout override in ms (server tools only). */
  timeoutMs?: number;
}

/**
 * Plugin service interface for providing custom agent tools.
 * Plugins implementing `AGENT_TOOL_PROVIDER` register additional tools
 * that the agent can use during execution.
 */
export interface AgentToolProvider extends IPluginService {
  /** Return the list of tools this provider offers. */
  getTools(): AgentToolProviderToolDef[];
}
