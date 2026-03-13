import type {
  ChatMessage,
  ChatStreamChunk,
  LLMProvider,
} from "@cat/plugin-core";

import type { NodeExecutor } from "@/graph/node-registry";

import { buildPatch } from "@/graph/blackboard";

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

export const LLMNodeExecutor: NodeExecutor = async (ctx, config) => {
  const provider = config.provider;
  if (!isLLMProvider(provider)) {
    throw new Error("LLM node config.provider is missing or invalid");
  }

  const systemPrompt =
    typeof config.systemPrompt === "string" ? config.systemPrompt : "";
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
    await ctx.eventBus.publish({
      runId: ctx.runId,
      nodeId: ctx.nodeId,
      type: "llm:complete",
      timestamp: new Date().toISOString(),
      payload: { content: cached.payload },
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
  const messages = Array.isArray(messagesRaw)
    ? messagesRaw.filter((item) => isChatMessage(item))
    : [];
  const resolvedPrompt = interpolateTemplate(systemPrompt, ctx.snapshot.data);

  let fullContent = "";
  let thinkingContent = "";
  let tokenBuffer = "";

  const onChunk = async (chunk: ChatStreamChunk): Promise<void> => {
    if (chunk.type === "text_delta") {
      fullContent += chunk.textDelta;
      tokenBuffer += chunk.textDelta;

      if (tokenBuffer.length >= 32) {
        await ctx.eventBus.publish({
          runId: ctx.runId,
          nodeId: ctx.nodeId,
          type: "llm:token",
          timestamp: new Date().toISOString(),
          payload: { delta: tokenBuffer },
        });
        tokenBuffer = "";
      }
    }

    if (chunk.type === "thinking_delta") {
      thinkingContent += chunk.thinkingDelta;
    }
  };

  const response = await provider.chat({
    messages: [{ role: "system", content: resolvedPrompt }, ...messages],
    temperature:
      typeof config.temperature === "number" ? config.temperature : undefined,
    maxTokens:
      typeof config.maxTokens === "number" ? config.maxTokens : undefined,
    onChunk: (chunk) => {
      void onChunk(chunk);
    },
    signal: ctx.signal,
  });

  if (tokenBuffer.length > 0) {
    await ctx.eventBus.publish({
      runId: ctx.runId,
      nodeId: ctx.nodeId,
      type: "llm:token",
      timestamp: new Date().toISOString(),
      payload: { delta: tokenBuffer },
    });
  }

  const finalContent = response.content ?? fullContent;
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

  await ctx.eventBus.publish({
    runId: ctx.runId,
    nodeId: ctx.nodeId,
    type: "llm:complete",
    timestamp: new Date().toISOString(),
    payload: { content: finalContent },
  });

  return {
    patch: buildPatch({
      actorId: ctx.nodeId,
      parentSnapshotVersion: ctx.snapshot.version,
      updates: {
        [responsePath]: finalContent,
        [`${ctx.nodeId}:thinking`]: thinkingContent,
        [`${ctx.nodeId}:toolCalls`]: response.toolCalls,
      },
    }),
    output,
    status: "completed",
  };
};
