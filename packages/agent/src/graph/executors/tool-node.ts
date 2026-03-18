import type { ChatMessage } from "@cat/plugin-core";

import type { NodeExecutor } from "@/graph/node-registry";
import type { AgentToolDefinition } from "@/tools/types";

import { buildPatch } from "@/graph/blackboard";

import { hashArgs, interpolateTemplate, resolvePath } from "./utils";

type GraphConfirmDecision =
  | "allow_once"
  | "trust_tool_for_session"
  | "trust_all_for_session"
  | "deny";

type GraphConfirmState = {
  callId?: string;
  decision?: GraphConfirmDecision;
};

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null && !Array.isArray(value);
};

const isTool = (value: unknown): value is AgentToolDefinition => {
  return (
    typeof value === "object" &&
    value !== null &&
    "execute" in value &&
    typeof (value as { execute?: unknown }).execute === "function"
  );
};

const isChatMessage = (value: unknown): value is ChatMessage => {
  if (typeof value !== "object" || value === null) return false;

  const role = Reflect.get(value, "role");
  const content = Reflect.get(value, "content");
  return (
    (role === "system" ||
      role === "user" ||
      role === "assistant" ||
      role === "tool") &&
    (typeof content === "string" || content === null)
  );
};

const toMessages = (value: unknown): ChatMessage[] => {
  if (!Array.isArray(value)) return [];
  return value.filter((item) => isChatMessage(item));
};

const parseToolArgs = (value: unknown): Record<string, unknown> => {
  if (isRecord(value)) return value;
  if (typeof value !== "string") return {};

  try {
    const parsed = JSON.parse(value);
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
};

const stringifyToolResult = (result: unknown): string => {
  if (typeof result === "string") return result;
  if (result === null || result === undefined) return "";
  if (typeof result === "number" || typeof result === "boolean") {
    return `${result}`;
  }

  try {
    return JSON.stringify(result);
  } catch {
    return "[unserializable tool result]";
  }
};

const toGraphConfirmState = (value: unknown): GraphConfirmState | null => {
  if (!isRecord(value)) return null;

  const decisionRaw = value["decision"];
  const callIdRaw = value["callId"];

  const decision: GraphConfirmDecision | undefined =
    decisionRaw === "allow_once" ||
    decisionRaw === "trust_tool_for_session" ||
    decisionRaw === "trust_all_for_session" ||
    decisionRaw === "deny"
      ? decisionRaw
      : undefined;

  const callId = typeof callIdRaw === "string" ? callIdRaw : undefined;

  if (!decision && !callId) return null;
  return { callId, decision };
};

export const ToolNodeExecutor: NodeExecutor = async (ctx, config) => {
  const tools = Array.isArray(ctx.runtime.tools)
    ? ctx.runtime.tools.filter((tool) => isTool(tool))
    : [];

  const toolNamePath =
    typeof config.toolNamePath === "string"
      ? config.toolNamePath
      : `${ctx.nodeId}.toolName`;
  const toolCallIdPath =
    typeof config.toolCallIdPath === "string"
      ? config.toolCallIdPath
      : `${ctx.nodeId}.toolCallId`;

  const toolName = resolvePath(ctx.snapshot.data, toolNamePath);
  const toolLike =
    typeof toolName === "string"
      ? tools.find((tool) => tool.name === toolName)
      : undefined;

  if (!isTool(toolLike)) {
    throw new Error("Tool runtime definition is missing or invalid");
  }

  const argsPath =
    typeof config.argsPath === "string"
      ? config.argsPath
      : `${ctx.nodeId}:args`;
  const argsTemplate =
    typeof config.argsTemplate === "string" ? config.argsTemplate : undefined;
  const resultPath =
    typeof config.resultPath === "string"
      ? config.resultPath
      : `${ctx.nodeId}:result`;

  const resolvedArgs = (() => {
    if (argsTemplate) {
      return parseToolArgs(
        interpolateTemplate(argsTemplate, ctx.snapshot.data),
      );
    }

    return parseToolArgs(resolvePath(ctx.snapshot.data, argsPath));
  })();

  const args = resolvedArgs;
  const toolCallId = resolvePath(ctx.snapshot.data, toolCallIdPath);
  const callId =
    typeof toolCallId === "string" && toolCallId.length > 0
      ? toolCallId
      : `${ctx.nodeId}:${hashArgs(args)}`;

  const confirmationState = toGraphConfirmState(
    resolvePath(ctx.snapshot.data, `__toolConfirm.${ctx.nodeId}`),
  );

  const hasPersistentTrust =
    confirmationState?.decision === "trust_tool_for_session" ||
    confirmationState?.decision === "trust_all_for_session";
  const isAllowOnceForCurrentCall =
    confirmationState?.decision === "allow_once" &&
    confirmationState.callId === callId;
  const isDeniedForCurrentCall =
    confirmationState?.decision === "deny" &&
    confirmationState.callId === callId;

  const confirmationPolicy =
    typeof config.confirmationPolicy === "string"
      ? config.confirmationPolicy
      : toolLike.confirmationPolicy;

  if (
    (confirmationPolicy === "always" ||
      confirmationPolicy === "always_confirm") &&
    !hasPersistentTrust &&
    !isAllowOnceForCurrentCall &&
    !isDeniedForCurrentCall
  ) {
    ctx.addEvent({
      type: "tool:confirm:required",
      payload: {
        callId,
        toolName: toolLike.name,
        args,
      },
    });

    return {
      status: "paused",
      pauseReason: "tool_confirmation_required",
      output: {
        toolName: toolLike.name,
      },
    };
  }

  if (isDeniedForCurrentCall) {
    const deniedMessage = "User denied tool execution";
    ctx.addEvent({
      type: "tool:error",
      payload: {
        callId,
        toolName: toolLike.name,
        error: deniedMessage,
      },
    });

    const deniedResult = {
      denied: true,
      error: deniedMessage,
    };

    return {
      patch: buildPatch({
        actorId: ctx.nodeId,
        parentSnapshotVersion: ctx.snapshot.version,
        updates: {
          [resultPath]: deniedResult,
          [`__toolConfirm.${ctx.nodeId}`]: null,
        },
      }),
      output: deniedResult,
      status: "completed",
    };
  }

  await ctx.emit({
    type: "tool:call",
    payload: {
      callId,
      toolName: toolLike.name,
      args,
    },
  });

  const started = Date.now();
  const result = await toolLike.execute(args, {
    traceId: `graph:${ctx.runId}`,
    sessionId: ctx.runId,
    signal: ctx.signal,
  });
  const durationMs = Date.now() - started;

  const idempotencyKey = `${ctx.nodeId}:${hashArgs(args)}`;
  await ctx.checkpointer.saveExternalOutput({
    runId: ctx.runId,
    nodeId: ctx.nodeId,
    outputType: "tool_result",
    outputKey: resultPath,
    payload: result,
    idempotencyKey,
    createdAt: new Date().toISOString(),
  });

  await ctx.emit({
    type: "tool:result",
    payload: {
      callId,
      toolName: toolLike.name,
      result,
      durationMs,
    },
  });

  const messages = toMessages(resolvePath(ctx.snapshot.data, "messages"));
  const nextMessages: ChatMessage[] = [
    ...messages,
    {
      role: "tool",
      content: stringifyToolResult(result),
      toolCallId: callId,
    },
  ];

  return {
    patch: buildPatch({
      actorId: ctx.nodeId,
      parentSnapshotVersion: ctx.snapshot.version,
      updates: {
        [resultPath]: result,
        messages: nextMessages,
        ...(isAllowOnceForCurrentCall
          ? { [`__toolConfirm.${ctx.nodeId}`]: null }
          : {}),
      },
    }),
    output: result,
    status: "completed",
  };
};
