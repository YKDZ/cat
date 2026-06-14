import type { PluginServiceType } from "@cat/shared";
import type { JSONSchema } from "@cat/shared";

import type { IPluginService } from "@/services/service";

// ─── Chat Message Types ───

/**
 * Chat message role.
 */
export type ChatMessageRole = "system" | "user" | "assistant" | "tool";

/**
 * A chat message in a conversation.
 */
export type ChatMessage = {
  role: ChatMessageRole;
  content: string | null;
  /** Used when role="tool" to identify which tool_call this is a response to */
  toolCallId?: string;
  /** Used when role="assistant" and the model requests tool calls */
  toolCalls?: ToolCall[];
  /**
   * Reasoning/thinking text from the model (e.g. mimo, DeepSeek R1).
   * Must be echoed back verbatim in subsequent requests when the model
   * operates in thinking mode (e.g. mimo requires this).
   */
  reasoningContent?: string;
};

// ─── Tool Types ───

/**
 * Tool definition with JSON Schema parameters.
 */
export type ToolDefinition = {
  name: string;
  description: string;
  /** JSON Schema describing the tool's parameters */
  parameters: JSONSchema;
};

/**
 * A tool call initiated by the LLM.
 */
export type ToolCall = {
  id: string;
  name: string;
  /** JSON-encoded arguments string */
  arguments: string;
};

// ─── Request / Response Types ───

/**
 * Chat completion request parameters (pure AsyncIterable mode, no onChunk callback).
 */
export type ChatCompletionRequest = {
  messages: ChatMessage[];
  tools?: ToolDefinition[];
  temperature?: number;
  maxTokens?: number;
  /**
   * Controls whether the model's extended thinking / reasoning mode is
   * enabled. When set to `false`, explicitly disables thinking for models
   * that support it (e.g. DeepSeek R1, Kimi). When omitted the provider
   * uses its default behaviour.
   */
  thinking?: boolean;
  signal?: AbortSignal;
};

/**
 * Finish reason for a chat completion.
 */
export type ChatCompletionFinishReason =
  | "stop"
  | "tool_calls"
  | "length"
  | "error";

/**
 * Token usage for a chat completion.
 */
export type ChatCompletionUsage = {
  promptTokens: number;
  completionTokens: number;
};

/**
 * Union type for a single chunk from LLM streaming output.
 */
export type LLMChunk =
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
  | { type: "usage"; usage: ChatCompletionUsage }
  | { type: "finish"; finishReason: ChatCompletionFinishReason }
  | { type: "error"; error: Error };

// ─── Abstract LLMProvider Service ───

/**
 * Abstract LLM Provider base class; all LLM provider plugins must extend this.
 */
export abstract class LLMProvider implements IPluginService {
  abstract getId(): string;

  getType(): PluginServiceType {
    return "LLM_PROVIDER";
  }

  /** Human-readable model identifier (e.g. "gpt-4o", "claude-sonnet-4-20250514") */
  abstract getModelName(): string;

  /**
   * Execute a chat completion request, returning an AsyncIterable chunk stream.
   */
  abstract chat(request: ChatCompletionRequest): AsyncIterable<LLMChunk>;
}
