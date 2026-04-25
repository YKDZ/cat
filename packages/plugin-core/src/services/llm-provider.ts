import type { PluginServiceType } from "@cat/shared";
import type { JSONSchema } from "@cat/shared";

import type { IPluginService } from "@/services/service";

// ─── Chat Message Types ───

/**
 * @zh 聊天消息角色。
 * @en Chat message role.
 */
export type ChatMessageRole = "system" | "user" | "assistant" | "tool";

/**
 * @zh 聊天消息。
 * @en A chat message in a conversation.
 */
export type ChatMessage = {
  role: ChatMessageRole;
  content: string | null;
  /** Used when role="tool" to identify which tool_call this is a response to */
  toolCallId?: string;
  /** Used when role="assistant" and the model requests tool calls */
  toolCalls?: ToolCall[];
};

// ─── Tool Types ───

/**
 * @zh 工具定义（JSON Schema 描述参数）。
 * @en Tool definition with JSON Schema parameters.
 */
export type ToolDefinition = {
  name: string;
  description: string;
  /** JSON Schema describing the tool's parameters */
  parameters: JSONSchema;
};

/**
 * @zh LLM 发起的工具调用。
 * @en A tool call initiated by the LLM.
 */
export type ToolCall = {
  id: string;
  name: string;
  /** JSON-encoded arguments string */
  arguments: string;
};

// ─── Request / Response Types ───

/**
 * @zh 聊天补全请求参数（纯 AsyncIterable 模式，无 onChunk 回调）。
 * @en Chat completion request parameters (pure AsyncIterable mode, no onChunk callback).
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
 * @zh 聊天完成的终止原因。
 * @en Finish reason for a chat completion.
 */
export type ChatCompletionFinishReason =
  | "stop"
  | "tool_calls"
  | "length"
  | "error";

/**
 * @zh 聊天补全的 Token 使用量。
 * @en Token usage for a chat completion.
 */
export type ChatCompletionUsage = {
  promptTokens: number;
  completionTokens: number;
};

/**
 * @zh LLM 流式输出的单个 Chunk 联合类型。
 * @en Union type for a single chunk from LLM streaming output.
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
 * @zh 抽象 LLM Provider 基类，所有 LLM Provider 插件必须继承此类。
 * @en Abstract LLM Provider base class; all LLM provider plugins must extend this.
 */
export abstract class LLMProvider implements IPluginService {
  abstract getId(): string;

  getType(): PluginServiceType {
    return "LLM_PROVIDER";
  }

  /** Human-readable model identifier (e.g. "gpt-4o", "claude-sonnet-4-20250514") */
  abstract getModelName(): string;

  /**
   * @zh 执行聊天补全请求，返回 AsyncIterable Chunk 流。
   * @en Execute a chat completion request, returning an AsyncIterable chunk stream.
   */
  abstract chat(request: ChatCompletionRequest): AsyncIterable<LLMChunk>;
}
