import type { PluginServiceType } from "@cat/shared/schema/enum";
import type { JSONSchema } from "@cat/shared/schema/json";

import type { IPluginService } from "@/services/service";

// ─── Chat Message Types ───

export type ChatMessageRole = "system" | "user" | "assistant" | "tool";

export type ChatMessage = {
  role: ChatMessageRole;
  content: string | null;
  /** Used when role="tool" to identify which tool_call this is a response to */
  toolCallId?: string;
  /** Used when role="assistant" and the model requests tool calls */
  toolCalls?: ToolCall[];
};

// ─── Tool Types ───

export type ToolDefinition = {
  name: string;
  description: string;
  /** JSON Schema describing the tool's parameters */
  parameters: JSONSchema;
};

export type ToolCall = {
  id: string;
  name: string;
  /** JSON-encoded arguments string */
  arguments: string;
};

// ─── Request / Response Types ───

export type ChatCompletionRequest = {
  messages: ChatMessage[];
  tools?: ToolDefinition[];
  temperature?: number;
  maxTokens?: number;
  /** Whether to enable streaming (default true). When set to false, onChunk callback is ignored. */
  stream?: boolean;
  /** Streaming callback — invoked for each chunk when streaming is used */
  onChunk?: (chunk: ChatStreamChunk) => void;
  signal?: AbortSignal;
  /**
   * Controls whether the model's extended thinking / reasoning mode is
   * enabled. When set to `false`, explicitly disables thinking for models
   * that support it (e.g. DeepSeek R1, Kimi). When omitted the provider
   * uses its default behaviour.
   */
  thinking?: boolean;
};

export type ChatStreamChunk =
  | { type: "text_delta"; textDelta: string }
  | { type: "thinking_delta"; thinkingDelta: string }
  | {
      type: "tool_call_delta";
      toolCallDelta: {
        id: string;
        name?: string;
        argumentsDelta?: string;
      };
    }
  | { type: "done" };

export type ChatCompletionFinishReason =
  | "stop"
  | "tool_calls"
  | "length"
  | "error";

export type ChatCompletionUsage = {
  promptTokens: number;
  completionTokens: number;
};

export type ChatCompletionResponse = {
  content: string | null;
  toolCalls: ToolCall[];
  usage: ChatCompletionUsage;
  finishReason: ChatCompletionFinishReason;
};

// ─── Abstract LLMProvider Service ───

export abstract class LLMProvider implements IPluginService {
  abstract getId(): string;

  getType(): PluginServiceType {
    return "LLM_PROVIDER";
  }

  /** Human-readable model identifier (e.g. "gpt-4o", "claude-sonnet-4-20250514") */
  abstract getModelName(): string;

  /** Execute a chat completion request */
  abstract chat(
    request: ChatCompletionRequest,
  ): Promise<ChatCompletionResponse>;

  /** Whether this provider supports streaming via onChunk callback */
  abstract supportsStreaming(): boolean;
}
