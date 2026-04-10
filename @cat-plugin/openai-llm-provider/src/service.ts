import type {
  ChatCompletionFinishReason,
  ChatCompletionRequest,
  LLMChunk,
} from "@cat/plugin-core";
import type {
  ChatCompletionMessageParam,
  ChatCompletionTool,
} from "openai/resources/chat/completions";

import { LLMProvider } from "@cat/plugin-core";
import OpenAI from "openai";
import { Stream } from "openai/streaming";
import { z } from "zod";

const SingleConfigSchema = z.object({
  id: z.string().optional(),
  apiKey: z.string().optional(),
  baseURL: z.string().optional(),
  model: z.string().optional().default("gpt-4o"),
});

export const ConfigSchema = z.union([
  z.array(SingleConfigSchema),
  SingleConfigSchema.transform((c) => [c]),
]);

type SingleConfig = z.infer<typeof SingleConfigSchema>;

export class OpenAILLMProvider extends LLMProvider {
  private client: OpenAI;
  private config: SingleConfig;

  constructor(config: SingleConfig) {
    super();
    this.config = config;
    this.client = new OpenAI({
      apiKey: this.config.apiKey || "dummy-key",
      baseURL: this.config.baseURL,
    });
  }

  getId(): string {
    return this.config.id ?? `openai-llm-provider-${this.config.model}`;
  }

  getModelName(): string {
    return this.config.model;
  }

  // generator function — arrow function cannot be used with yield, function keyword required here
  async *chat(request: ChatCompletionRequest): AsyncIterable<LLMChunk> {
    const messages = request.messages.map(toOpenAIMessage);
    const tools = request.tools?.map(toOpenAITool);

    const params = {
      model: this.config.model,
      messages,
      tools: tools && tools.length > 0 ? tools : undefined,
      temperature: request.temperature,
      max_tokens: request.maxTokens,
      stream: true as const,
      stream_options: { include_usage: true },
      ...(request.thinking !== undefined && {
        // oxlint-disable-next-line no-unsafe-type-assertion -- enable_thinking is an OpenAI-compatible extension not in the official SDK types
        enable_thinking: request.thinking as unknown,
      }),
    };

    let stream: Stream<OpenAI.Chat.Completions.ChatCompletionChunk>;
    try {
      // oxlint-disable-next-line no-unsafe-type-assertion -- stream: true guarantees Stream type
      stream = (await this.client.chat.completions.create(params, {
        signal: request.signal,
      })) as Stream<OpenAI.Chat.Completions.ChatCompletionChunk>;
    } catch (error) {
      // Retry without thinking parameter if the provider doesn't support it
      if (
        request.thinking !== undefined &&
        error instanceof Error &&
        error.message.includes("enable_thinking") &&
        error.message.includes("unexpected keyword argument")
      ) {
        const { enable_thinking: _ignored, ...fallbackParams } = params;
        // oxlint-disable-next-line no-unsafe-type-assertion -- stream: true guarantees Stream type
        stream = (await this.client.chat.completions.create(fallbackParams, {
          signal: request.signal,
        })) as Stream<OpenAI.Chat.Completions.ChatCompletionChunk>;
      } else {
        yield {
          type: "error",
          error: error instanceof Error ? error : new Error(String(error)),
        };
        return;
      }
    }

    try {
      // Track tool call accumulation by index for delta assembly
      const toolCallAccMap = new Map<
        number,
        { id: string; name: string; arguments: string }
      >();

      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta;

        // Handle reasoning/thinking content (e.g. DeepSeek, o1 models)
        // oxlint-disable-next-line no-unsafe-type-assertion -- OpenAI-compatible APIs may include reasoning_content outside official types
        const reasoningContent = (delta as Record<string, unknown> | undefined)
          ?.reasoning_content as string | undefined;
        if (reasoningContent) {
          yield { type: "thinking_delta", thinkingDelta: reasoningContent };
        }

        if (delta?.content) {
          yield { type: "text_delta", textDelta: delta.content };
        }

        if (delta?.tool_calls) {
          for (const tc of delta.tool_calls) {
            const idx = tc.index;
            const existing = toolCallAccMap.get(idx);

            if (!existing) {
              toolCallAccMap.set(idx, {
                id: tc.id ?? "",
                name: tc.function?.name ?? "",
                arguments: tc.function?.arguments ?? "",
              });
            } else {
              if (tc.function?.arguments) {
                existing.arguments += tc.function.arguments;
              }
            }

            yield {
              type: "tool_call_delta",
              toolCallDelta: {
                id: tc.id ?? existing?.id ?? "",
                name: tc.function?.name,
                argumentsDelta: tc.function?.arguments,
              },
            };
          }
        }

        if (chunk.choices[0]?.finish_reason) {
          yield {
            type: "finish",
            finishReason: mapFinishReason(chunk.choices[0].finish_reason),
          };
        }

        if (chunk.usage) {
          yield {
            type: "usage",
            usage: {
              promptTokens: chunk.usage.prompt_tokens ?? 0,
              completionTokens: chunk.usage.completion_tokens ?? 0,
            },
          };
        }
      }
    } catch (error) {
      yield {
        type: "error",
        error: error instanceof Error ? error : new Error(String(error)),
      };
    }
  }
}

// ─── Helpers ───

const toOpenAIMessage = (
  msg: ChatCompletionRequest["messages"][number],
): ChatCompletionMessageParam => {
  if (msg.role === "tool") {
    return {
      role: "tool",
      content: msg.content ?? "",
      tool_call_id: msg.toolCallId ?? "",
    };
  }

  if (msg.role === "assistant" && msg.toolCalls && msg.toolCalls.length > 0) {
    return {
      role: "assistant",
      content: msg.content,
      tool_calls: msg.toolCalls.map((tc) => ({
        id: tc.id,
        type: "function" as const,
        function: { name: tc.name, arguments: tc.arguments },
      })),
    };
  }

  if (msg.role === "system") {
    return {
      role: "system",
      content: msg.content ?? "",
    };
  }

  return {
    role: "user",
    content: msg.content ?? "",
  };
};

const toOpenAITool = (
  tool: NonNullable<ChatCompletionRequest["tools"]>[number],
): ChatCompletionTool => ({
  type: "function",
  function: {
    name: tool.name,
    description: tool.description,
    // oxlint-disable-next-line no-unsafe-type-assertion -- tool.parameters schema is validated at runtime by the plugin system
    parameters: tool.parameters as Record<string, unknown>,
  },
});

const mapFinishReason = (reason: string | null): ChatCompletionFinishReason => {
  switch (reason) {
    case "stop":
    case "tool_calls":
    case "length":
      return reason;
    case null:
    default:
      return "stop";
  }
};
