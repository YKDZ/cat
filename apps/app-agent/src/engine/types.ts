import type {
  ChatCompletionResponse,
  ChatMessage,
  ChatStreamChunk,
  LLMProvider,
  ToolCall,
  ToolDefinition,
} from "@cat/plugin-core";
import type {
  ToolConfirmRequest,
  ToolConfirmResponse,
  ToolExecuteRequest,
  ToolExecuteResponse,
} from "@cat/shared/schema/agent";

import type { AgentDefinition } from "@/schema/agent-definition";
import type { AgentToolDefinition } from "@/tools/types";

// ─── Agent Step Record ───

export type ToolCallRecord = {
  id: string;
  toolName: string;
  arguments: Record<string, unknown>;
  result: unknown;
  error: string | null;
  durationMs: number;
  /** Where this tool executed */
  target: "server" | "client";
  /** How the execution was authorized */
  confirmationStatus: "auto_allowed" | "user_approved" | "user_denied" | null;
};

export type AgentStep = {
  index: number;
  /** LLM text response for this step (null if only tool calls) */
  thought: string | null;
  /** Extended thinking text emitted during this step's LLM call */
  thinkingText: string | null;
  /** Tool calls made in this step */
  toolCalls: ToolCallRecord[];
  /**
   * `true` when this step caused the agent loop to terminate (finish tool
   * invoked or implicit completion).  The frontend uses this flag to keep
   * the live `streamingText` visible in the message bubble instead of
   * clearing it on receipt of the step chunk.
   */
  isFinish?: boolean;
};

// ─── Run Options ───

export type AgentRunOptions = {
  definition: AgentDefinition;
  /** Initial message history (should include system prompt) */
  messages: ChatMessage[];
  tools: AgentToolDefinition[];
  llmProvider: LLMProvider;
  maxSteps?: number;
  signal?: AbortSignal;
  /** Session ID for tool execution context */
  sessionId: string;
  traceId: string;
  /** Current session-level trust policy */
  sessionTrustPolicy?: "confirm_all" | "trust_session";
  /** Set of tool names already trusted for this session */
  trustedToolNames?: Set<string>;
  /** Called after each ReAct step completes */
  onStep?: (step: AgentStep) => void;
  /** Called for streaming text/tool_call deltas */
  onChunk?: (chunk: ChatStreamChunk) => void;
  /**
   * Called when the engine injects a correction prompt because the LLM
   * responded with plain text instead of calling the finish tool.
   * The frontend should reset streaming accumulators (streamingText,
   * thinkingText) so the correction retry streams cleanly.
   */
  onCorrectionRetry?: () => void;
  /**
   * Called when a tool requires user confirmation before execution.
   * The agent loop pauses until the returned promise resolves.
   */
  onToolConfirmRequest?: (
    request: ToolConfirmRequest,
  ) => Promise<ToolConfirmResponse>;
  /**
   * Called when a client-side tool needs to be executed in the user's browser.
   * The agent loop pauses until the returned promise resolves with the result.
   */
  onToolExecuteRequest?: (
    request: ToolExecuteRequest,
  ) => Promise<ToolExecuteResponse>;
};

// ─── Run Result ───

export type AgentRunResult = {
  steps: AgentStep[];
  /** Final assistant text message (last non-tool-call response) */
  finalMessage: string | null;
  usage: {
    totalPromptTokens: number;
    totalCompletionTokens: number;
  };
  /** Whether the agent completed normally or hit the step limit */
  finishReason:
    | "completed"
    | "max_steps"
    | "error"
    | "cancelled"
    | "implicit_completion";
};

// ─── Internal helpers (re-exported for testing) ───

export type { ChatMessage, ChatStreamChunk, ToolCall, ToolDefinition };
export type { ChatCompletionResponse };
