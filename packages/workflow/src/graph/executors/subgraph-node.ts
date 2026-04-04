import type { NodeExecutor } from "@/graph/node-registry";

import { buildPatch } from "@/graph/blackboard";

import { resolvePath } from "./utils";

const toResultPath = (nodeId: string, value: unknown): string => {
  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim();
  }
  return `${nodeId}:subgraph`;
};

const toInputPath = (value: unknown): string => {
  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim();
  }
  return "input";
};

export const SubgraphNodeExecutor: NodeExecutor = async (ctx, config) => {
  const subgraphId =
    typeof config.subgraphId === "string" && config.subgraphId.trim().length > 0
      ? config.subgraphId.trim()
      : "";

  if (subgraphId.length === 0) {
    throw new Error(`Subgraph node requires subgraphId: ${ctx.nodeId}`);
  }

  const resultPath = toResultPath(ctx.nodeId, config.resultPath);
  const inputPath = toInputPath(config.inputPath);
  const subgraphInput = resolvePath(ctx.snapshot.data, inputPath);

  const output = {
    subgraphId,
    inputPath,
    input: subgraphInput ?? null,
  };

  return {
    patch: buildPatch({
      actorId: ctx.nodeId,
      parentSnapshotVersion: ctx.snapshot.version,
      updates: {
        [resultPath]: output,
      },
    }),
    output,
    status: "completed",
  };
};
