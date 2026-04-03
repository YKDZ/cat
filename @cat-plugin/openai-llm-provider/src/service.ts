import type {
  ChatCompletionRequest,
  ChatCompletionResponse,
  ChatStreamChunk,
  FimCompletionRequest,
  FimCompletionResponse,
  ToolCall,
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

  supportsStreaming(): boolean {
    return true;
  }

  private shouldRetryWithoutThinking(
    request: ChatCompletionRequest,
    error: unknown,
  ): boolean {
    if (request.thinking === undefined || !(error instanceof Error)) {
      return false;
    }

    return (
      error.message.includes("enable_thinking") &&
      error.message.includes("unexpected keyword argument")
    );
  }

  async chat(request: ChatCompletionRequest): Promise<ChatCompletionResponse> {
    const messages = request.messages.map(toOpenAIMessage);
    const tools = request.tools?.map(toOpenAITool);

    // If stream=false is explicitly set, use non-streaming path (ignore onChunk)
    if (request.stream === false) {
      return this.chatNonStreaming(request, messages, tools);
    }

    // Default behavior: if onChunk callback is provided, use streaming
    if (request.onChunk) {
      return this.chatStreaming(request, messages, tools);
    }

    return this.chatNonStreaming(request, messages, tools);
  }

  override supportsFim(): boolean {
    return true;
  }

  override async fim(
    request: FimCompletionRequest,
  ): Promise<FimCompletionResponse> {
    const shouldStream = request.stream !== false;

    if (shouldStream && request.onChunk) {
      return this.fimStreaming(request);
    }

    return this.fimNonStreaming(request);
  }

  private async fimNonStreaming(
    request: FimCompletionRequest,
  ): Promise<FimCompletionResponse> {
    const completion = await this.client.completions.create(
      {
        model: this.config.model,
        prompt: `${request.system}\n\n${request.prefix || ""}`,
        temperature: request.temperature,
        max_tokens: request.maxTokens,
        suffix: request.suffix || undefined,
        stream: false,
      },
      { signal: request.signal },
    );

    const choice = completion.choices[0];

    return {
      content: choice.text ?? "",
      usage: {
        promptTokens: completion.usage?.prompt_tokens ?? 0,
        completionTokens: completion.usage?.completion_tokens ?? 0,
      },
    };
  }

  private async fimStreaming(
    request: FimCompletionRequest,
  ): Promise<FimCompletionResponse> {
    const onChunk = request.onChunk!;

    const stream = await this.client.completions.create(
      {
        model: this.config.model,
        prompt: `${request.system}\n\n${request.prefix || ""}`,
        temperature: request.temperature,
        max_tokens: request.maxTokens,
        suffix: request.suffix || undefined,
        stream: true,
        stream_options: { include_usage: true },
      },
      { signal: request.signal },
    );

    let contentAcc = "";
    let promptTokens = 0;
    let completionTokens = 0;

    for await (const chunk of stream) {
      const delta = chunk.choices[0];

      if (delta?.text) {
        contentAcc += delta.text;
        onChunk({ type: "text_delta", textDelta: delta.text });
      }

      if (chunk.usage) {
        promptTokens = chunk.usage.prompt_tokens ?? 0;
        completionTokens = chunk.usage.completion_tokens ?? 0;
      }
    }

    onChunk({ type: "done" });

    return {
      content: contentAcc,
      usage: { promptTokens, completionTokens },
    };
  }

  private async chatNonStreaming(
    request: ChatCompletionRequest,
    messages: ChatCompletionMessageParam[],
    tools: ChatCompletionTool[] | undefined,
  ): Promise<ChatCompletionResponse> {
    const params = {
      model: this.config.model,
      messages,
      tools: tools && tools.length > 0 ? tools : undefined,
      temperature: request.temperature,
      max_tokens: request.maxTokens,
      ...(request.thinking !== undefined && {
        // oxlint-disable-next-line no-unsafe-type-assertion -- enable_thinking is an OpenAI-compatible extension not in the official SDK types
        enable_thinking: request.thinking as unknown,
      }),
    };

    let completion;
    try {
      completion = await this.client.chat.completions.create(params, {
        signal: request.signal,
      });
    } catch (error) {
      if (!this.shouldRetryWithoutThinking(request, error)) {
        throw error;
      }

      const { enable_thinking: _ignored, ...fallbackParams } = params;
      completion = await this.client.chat.completions.create(fallbackParams, {
        signal: request.signal,
      });
    }

    const choice = completion.choices[0];
    const toolCalls: ToolCall[] =
      choice.message.tool_calls
        ?.filter(
          (tc): tc is Extract<typeof tc, { type: "function" }> =>
            tc.type === "function",
        )
        .map((tc) => ({
          id: tc.id,
          name: tc.function.name,
          arguments: tc.function.arguments,
        })) ?? [];

    return {
      content: choice.message.content,
      toolCalls,
      usage: {
        promptTokens: completion.usage?.prompt_tokens ?? 0,
        completionTokens: completion.usage?.completion_tokens ?? 0,
      },
      finishReason: mapFinishReason(choice.finish_reason),
    };
  }

  private async chatStreaming(
    request: ChatCompletionRequest,
    messages: ChatCompletionMessageParam[],
    tools: ChatCompletionTool[] | undefined,
  ): Promise<ChatCompletionResponse> {
    const onChunk = request.onChunk!;

    const params = {
      model: this.config.model,
      messages,
      tools: tools && tools.length > 0 ? tools : undefined,
      temperature: request.temperature,
      max_tokens: request.maxTokens,
      stream: true,
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
      if (!this.shouldRetryWithoutThinking(request, error)) {
        throw error;
      }

      const { enable_thinking: _ignored, ...fallbackParams } = params;
      // oxlint-disable-next-line no-unsafe-type-assertion -- stream: true guarantees Stream type
      stream = (await this.client.chat.completions.create(fallbackParams, {
        signal: request.signal,
      })) as Stream<OpenAI.Chat.Completions.ChatCompletionChunk>;
    }

    let contentAcc = "";
    const toolCallAccMap = new Map<
      number,
      { id: string; name: string; arguments: string }
    >();
    let finishReason: ChatCompletionResponse["finishReason"] = "stop";
    let promptTokens = 0;
    let completionTokens = 0;

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta;

      // Handle reasoning/thinking content (e.g. DeepSeek, o1 models)
      // oxlint-disable-next-line no-unsafe-type-assertion -- OpenAI-compatible APIs may include reasoning_content outside official types
      const reasoningContent = (delta as Record<string, unknown> | undefined)
        ?.reasoning_content as string | undefined;
      if (reasoningContent) {
        onChunk({ type: "thinking_delta", thinkingDelta: reasoningContent });
      }

      if (delta?.content) {
        contentAcc += delta.content;
        onChunk({ type: "text_delta", textDelta: delta.content });
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

          const toolCallChunk: ChatStreamChunk = {
            type: "tool_call_delta",
            toolCallDelta: {
              id: tc.id ?? existing?.id ?? "",
              name: tc.function?.name,
              argumentsDelta: tc.function?.arguments,
            },
          };
          onChunk(toolCallChunk);
        }
      }

      if (chunk.choices[0]?.finish_reason) {
        finishReason = mapFinishReason(chunk.choices[0].finish_reason);
      }

      if (chunk.usage) {
        promptTokens = chunk.usage.prompt_tokens ?? 0;
        completionTokens = chunk.usage.completion_tokens ?? 0;
      }
    }

    onChunk({ type: "done" });

    const toolCalls: ToolCall[] = [...toolCallAccMap.values()];

    return {
      content: contentAcc || null,
      toolCalls,
      usage: { promptTokens, completionTokens },
      finishReason,
    };
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

const mapFinishReason = (
  reason: string | null,
): ChatCompletionResponse["finishReason"] => {
  switch (reason) {
    case "stop":
      return "stop";
    case "tool_calls":
      return "tool_calls";
    case "length":
      return "length";
    case null:
      return "stop";
    default:
      return "stop";
  }
};
