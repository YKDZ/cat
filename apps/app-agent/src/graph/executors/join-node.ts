import type { NodeExecutor } from "@/graph/node-registry";

import { buildPatch } from "@/graph/blackboard";

import { resolvePath } from "./utils";

const toInputPaths = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];

  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
};

const toResultPath = (nodeId: string, value: unknown): string => {
  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim();
  }
  return `${nodeId}:join`;
};

export const JoinNodeExecutor: NodeExecutor = async (ctx, config) => {
  const inputPaths = toInputPaths(config.inputPaths);
  const resultPath = toResultPath(ctx.nodeId, config.resultPath);

  const merged = inputPaths.reduce<Record<string, unknown>>((acc, path) => {
    acc[path] = resolvePath(ctx.snapshot.data, path);
    return acc;
  }, {});

  return {
    patch: buildPatch({
      actorId: ctx.nodeId,
      parentSnapshotVersion: ctx.snapshot.version,
      updates: {
        [resultPath]: merged,
      },
    }),
    output: merged,
    status: "completed",
  };
};
