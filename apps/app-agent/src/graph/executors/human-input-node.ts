import type { NodeExecutor } from "@/graph/node-registry";

import { buildPatch } from "@/graph/blackboard";

export const HumanInputNodeExecutor: NodeExecutor = async (ctx, config) => {
  const prompt =
    typeof config.prompt === "string" ? config.prompt : "请继续输入";
  const timeoutMs =
    typeof config.timeoutMs === "number" ? config.timeoutMs : 300_000;
  const inputPath =
    typeof config.inputPath === "string"
      ? config.inputPath
      : `${ctx.nodeId}:input`;

  await ctx.eventBus.publish({
    runId: ctx.runId,
    nodeId: ctx.nodeId,
    type: "human:input:required",
    timestamp: new Date().toISOString(),
    payload: {
      prompt,
      timeoutMs,
      inputPath,
    },
  });

  return {
    status: "paused",
    pauseReason: "human_input_required",
    output: {
      prompt,
      timeoutMs,
      inputPath,
    },
  };
};

export const resumeHumanInputNode = async (
  ctx: Parameters<NodeExecutor>[0],
  config: Record<string, unknown>,
  input: unknown,
): Promise<{
  patch: ReturnType<typeof buildPatch>;
  output: { input: unknown };
  status: "completed";
}> => {
  const inputPath =
    typeof config.inputPath === "string"
      ? config.inputPath
      : `${ctx.nodeId}:input`;

  return {
    patch: buildPatch({
      actorId: ctx.nodeId,
      parentSnapshotVersion: ctx.snapshot.version,
      updates: {
        [inputPath]: input,
      },
    }),
    output: { input },
    status: "completed" as const,
  };
};
