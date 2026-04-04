import type { NodeExecutor } from "@/graph/node-registry";

import { buildPatch } from "@/graph/blackboard";

const toBranchIds = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];

  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
};

export const ParallelNodeExecutor: NodeExecutor = async (ctx, config) => {
  const branches = toBranchIds(config.branches ?? config.nodes);
  const maxConcurrency =
    typeof config.maxConcurrency === "number" &&
    Number.isInteger(config.maxConcurrency) &&
    config.maxConcurrency > 0
      ? config.maxConcurrency
      : branches.length;

  if (branches.length === 0) {
    throw new Error(
      `Parallel node requires non-empty branches/nodes config: ${ctx.nodeId}`,
    );
  }

  const output = {
    branches,
    maxConcurrency,
  };

  return {
    patch: buildPatch({
      actorId: ctx.nodeId,
      parentSnapshotVersion: ctx.snapshot.version,
      updates: {
        [`${ctx.nodeId}:parallel`]: output,
      },
    }),
    output,
    status: "completed",
  };
};
