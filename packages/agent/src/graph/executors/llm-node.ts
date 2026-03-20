import type {
  ChatMessage,
  ChatStreamChunk,
  LLMProvider,
  ToolDefinition,
} from "@cat/plugin-core";

import * as z from "zod/v4";

import type { NodeExecutor } from "@/graph/node-registry";
import type { AgentToolDefinition } from "@/tools/types";

import { buildPatch } from "@/graph/blackboard";

import type { EventEnvelopeInput } from "../events";

import { interpolateTemplate, resolvePath } from "./utils";

const isLLMProvider = (value: unknown): value is LLMProvider => {
  return (
    typeof value === "object" &&
    value !== null &&
    "chat" in value &&
    typeof (value as { chat?: unknown }).chat === "function"
  );
};

const isChatMessage = (value: unknown): value is ChatMessage => {
  if (typeof value !== "object" || value === null) return false;
  const role = Reflect.get(value, "role");
  const content = Reflect.get(value, "content");
  const validRole =
    role === "system" ||
    role === "user" ||
    role === "assistant" ||
    role === "tool";
  const validContent = typeof content === "string" || content === null;
  return validRole && validContent;
};

const isToolArray = (value: unknown): value is AgentToolDefinition[] => {
  return (
    Array.isArray(value) &&
    value.every((item) => {
      if (typeof item !== "object" || item === null) return false;
      const name = Reflect.get(item, "name");
      const description = Reflect.get(item, "description");
      const execute = Reflect.get(item, "execute");
      const parameters = Reflect.get(item, "parameters");
      return (
        typeof name === "string" &&
        typeof description === "string" &&
        typeof execute === "function" &&
        typeof parameters === "object" &&
        parameters !== null
      );
    })
  );
};

const toToolDefinitions = (tools: AgentToolDefinition[]): ToolDefinition[] => {
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    parameters: z.toJSONSchema(tool.parameters),
  }));
};

const toMessages = (value: unknown): ChatMessage[] => {
  if (!Array.isArray(value)) return [];
  return value.filter((item) => isChatMessage(item));
};

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null && !Array.isArray(value);
};

export const LLMNodeExecutor: NodeExecutor = async (ctx, config) => {
  const provider = ctx.runtime.llmProvider;
  if (!isLLMProvider(provider)) {
    throw new Error("LLM runtime provider is missing or invalid");
  }

  const runtimeTools = isToolArray(ctx.runtime.tools) ? ctx.runtime.tools : [];

  const systemPrompt =
    typeof config.systemPrompt === "string"
      ? config.systemPrompt
      : (ctx.runtime.systemPrompt ?? "");
  const messagesPath =
    typeof config.messagesPath === "string" ? config.messagesPath : "messages";
  const responsePath =
    typeof config.responsePath === "string"
      ? config.responsePath
      : `${ctx.nodeId}:response`;

  const idempotencyKey =
    ctx.idempotencyKey ?? `${ctx.nodeId}:${ctx.snapshot.version}`;
  const cached = await ctx.checkpointer.loadExternalOutputByIdempotency(
    ctx.runId,
    idempotencyKey,
  );

  if (cached) {
    const cachedPayload = isRecord(cached.payload) ? cached.payload : {};
    const cachedContent = Reflect.get(cachedPayload, "content");
    const cachedThinking = Reflect.get(cachedPayload, "thinking");
    const cachedToolCalls = Reflect.get(cachedPayload, "toolCalls");

    ctx.addEvent({
      type: "llm:complete",
      payload: {
        content: typeof cachedContent === "string" ? cachedContent : null,
        thinking: typeof cachedThinking === "string" ? cachedThinking : "",
        toolCalls: Array.isArray(cachedToolCalls) ? cachedToolCalls : [],
      },
    });

    return {
      patch: buildPatch({
        actorId: ctx.nodeId,
        parentSnapshotVersion: ctx.snapshot.version,
        updates: {
          [responsePath]: cached.payload,
        },
      }),
      output: cached.payload,
      status: "completed",
    };
  }

  const messagesRaw = resolvePath(ctx.snapshot.data, messagesPath);
  const messages = toMessages(messagesRaw);
  const resolvedPrompt = interpolateTemplate(systemPrompt, ctx.snapshot.data);

  let fullContent = "";
  let thinkingContent = "";
  let tokenBuffer = "";
  let publishChain = Promise.resolve();

  const queueEventPublish = (event: EventEnvelopeInput): void => {
    publishChain = publishChain
      .then(async () => ctx.emit(event))
      .then(() => undefined);
  };

  const onChunk = async (chunk: ChatStreamChunk): Promise<void> => {
    if (chunk.type === "text_delta") {
      fullContent += chunk.textDelta;
      tokenBuffer += chunk.textDelta;

      if (tokenBuffer.length >= 32) {
        const delta = tokenBuffer;
        tokenBuffer = "";

        queueEventPublish({
          type: "llm:token",
          payload: { delta },
        });
      }
    }

    if (chunk.type === "thinking_delta") {
      thinkingContent += chunk.thinkingDelta;
      queueEventPublish({
        type: "llm:thinking",
        payload: { delta: chunk.thinkingDelta },
      });
    }
  };

  const response = await provider.chat({
    messages: [{ role: "system", content: resolvedPrompt }, ...messages],
    tools:
      runtimeTools.length > 0 ? toToolDefinitions(runtimeTools) : undefined,
    temperature:
      typeof config.temperature === "number" ? config.temperature : undefined,
    maxTokens:
      typeof config.maxTokens === "number" ? config.maxTokens : undefined,
    onChunk: (chunk) => {
      void onChunk(chunk);
    },
    signal: ctx.signal,
  });

  await publishChain;

  if (tokenBuffer.length > 0) {
    await ctx.emit({
      type: "llm:token",
      payload: { delta: tokenBuffer },
    });
  }

  const finalContent = response.content ?? fullContent;
  const finishRequested = response.toolCalls.some((toolCall) =>
    runtimeTools.some(
      (tool) => tool.isFinishTool && tool.name === toolCall.name,
    ),
  );
  const nextMessages: ChatMessage[] = [
    ...messages,
    {
      role: "assistant",
      content: finalContent,
      ...(response.toolCalls.length > 0
        ? { toolCalls: response.toolCalls }
        : {}),
    },
  ];
  const output = {
    content: finalContent,
    thinking: thinkingContent,
    toolCalls: response.toolCalls,
  };

  await ctx.checkpointer.saveExternalOutput({
    runId: ctx.runId,
    nodeId: ctx.nodeId,
    outputType: "llm_response",
    outputKey: responsePath,
    payload: output,
    idempotencyKey,
    createdAt: new Date().toISOString(),
  });

  ctx.addEvent({
    type: "llm:complete",
    payload: {
      content: finalContent,
      thinking: thinkingContent,
      toolCalls: response.toolCalls,
      finishReason: response.finishReason,
    },
  });

  return {
    patch: buildPatch({
      actorId: ctx.nodeId,
      parentSnapshotVersion: ctx.snapshot.version,
      updates: {
        [responsePath]: finalContent,
        [`${ctx.nodeId}.thinking`]: thinkingContent,
        [`${ctx.nodeId}.toolCalls`]: response.toolCalls,
        [`${ctx.nodeId}.finishRequested`]: finishRequested,
        messages: nextMessages,
      },
    }),
    output,
    status: "completed",
  };
};
