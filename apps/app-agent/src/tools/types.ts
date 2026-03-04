import type { ZodObject, ZodRawShape, output as ZodOutput } from "zod/v4";

// ─── Tool Confirmation Policy ───

/**
 * Determines when a tool requires explicit user confirmation before execution.
 * - `auto_allow` — Execute immediately without user confirmation (read-only / low-risk).
 * - `session_trust` — Respect the session-level trust policy.
 * - `always_confirm` — Always require explicit user confirmation (high-risk / destructive).
 */
export type ToolConfirmationPolicy =
  | "auto_allow"
  | "session_trust"
  | "always_confirm";

/**
 * Where the tool executes.
 * - `server` — Executes on the backend (current default).
 * - `client` — Executes on the user's browser; the backend delegates via streaming protocol.
 */
export type ToolTarget = "server" | "client";

// ─── Tool Execution Context ───

export type ToolExecutionContext = {
  traceId: string;
  sessionId: string;
  signal?: AbortSignal;
};

// ─── Agent Tool Definition ───

export type AgentToolDefinition = {
  /** Unique tool name, also used as the LLM function name */
  name: string;
  description: string;
  /** Zod schema for parameters — automatically converted to JSON Schema for LLM */
  parameters: ZodObject<ZodRawShape>;
  /**
   * Tool execution function — receives already-validated args (parsed by the framework).
   * For client-side tools this is a no-op placeholder; actual execution happens in the browser.
   */
  execute: (
    args: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ) => Promise<unknown>;
  /**
   * Per-tool timeout override (ms). When set, overrides the global TOOL_CALL_TIMEOUT_MS
   * in the agent loop. Use for tools that chain multiple external API calls (e.g. recognize_terms).
   */
  timeoutMs?: number;
  /**
   * Where this tool executes. Defaults to `"server"`.
   * Client tools are delegated to the user's browser via the streaming protocol.
   */
  target?: ToolTarget;
  /**
   * Confirmation policy. Defaults to `"auto_allow"`.
   * Controls whether the user must approve execution before the tool runs.
   */
  confirmationPolicy?: ToolConfirmationPolicy;
  /**
   * When `true`, the agent loop treats a successful call to this tool as the
   * explicit termination signal. The tool's `message` argument becomes the
   * final response delivered to the user.
   *
   * Only one tool in the registry should have this flag set.
   */
  isFinishTool?: boolean;
};

/**
 * Factory that infers the schema output type for `execute`, so args are
 * fully typed without manually calling `parameters.parse()` inside each tool.
 *
 * The agent framework calls `parameters.parse()` automatically before invoking
 * `execute`, so individual tools never need to validate args themselves.
 */
export const defineTool = <TSchema extends ZodObject<ZodRawShape>>(def: {
  name: string;
  description: string;
  parameters: TSchema;
  execute: (
    args: ZodOutput<TSchema>,
    ctx: ToolExecutionContext,
  ) => Promise<unknown>;
  timeoutMs?: number;
  target?: ToolTarget;
  confirmationPolicy?: ToolConfirmationPolicy;
  isFinishTool?: boolean;
  // oxlint-disable-next-line no-unsafe-type-assertion -- safe: framework guarantees parameters.parse() before execute
}): AgentToolDefinition => def as unknown as AgentToolDefinition;

/**
 * Define a client-side tool declaration that has no server `execute` implementation.
 * The backend registers this so the LLM knows the tool exists, but actual
 * execution is delegated to the frontend via the streaming protocol.
 */
export const defineClientTool = <TSchema extends ZodObject<ZodRawShape>>(def: {
  name: string;
  description: string;
  parameters: TSchema;
  confirmationPolicy?: ToolConfirmationPolicy;
}): AgentToolDefinition => ({
  name: def.name,
  description: def.description,
  parameters: def.parameters,
  execute: async () => {
    throw new Error(
      `Client tool "${def.name}" cannot be executed on the server`,
    );
  },
  target: "client",
  confirmationPolicy: def.confirmationPolicy ?? "session_trust",
});
