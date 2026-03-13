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
  const toolLike = config.tool;
  if (!isTool(toolLike)) {
    throw new Error("Tool node config.tool is missing or invalid");
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
      const parsed = JSON.parse(
        interpolateTemplate(argsTemplate, ctx.snapshot.data),
      );
      return isRecord(parsed) ? parsed : {};
    }

    const fromPath = resolvePath(ctx.snapshot.data, argsPath);
    return isRecord(fromPath) ? fromPath : {};
  })();

  const args = resolvedArgs;
  const callId = `${ctx.nodeId}:${hashArgs(args)}`;

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
    await ctx.eventBus.publish({
      runId: ctx.runId,
      nodeId: ctx.nodeId,
      type: "tool:confirm:required",
      timestamp: new Date().toISOString(),
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
    await ctx.eventBus.publish({
      runId: ctx.runId,
      nodeId: ctx.nodeId,
      type: "tool:error",
      timestamp: new Date().toISOString(),
      payload: {
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

  await ctx.eventBus.publish({
    runId: ctx.runId,
    nodeId: ctx.nodeId,
    type: "tool:call",
    timestamp: new Date().toISOString(),
    payload: {
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

  await ctx.eventBus.publish({
    runId: ctx.runId,
    nodeId: ctx.nodeId,
    type: "tool:result",
    timestamp: new Date().toISOString(),
    payload: {
      toolName: toolLike.name,
      result,
      durationMs,
    },
  });

  return {
    patch: buildPatch({
      actorId: ctx.nodeId,
      parentSnapshotVersion: ctx.snapshot.version,
      updates: {
        [resultPath]: result,
        ...(isAllowOnceForCurrentCall
          ? { [`__toolConfirm.${ctx.nodeId}`]: null }
          : {}),
      },
    }),
    output: result,
    status: "completed",
  };
};
