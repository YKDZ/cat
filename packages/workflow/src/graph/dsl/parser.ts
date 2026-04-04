import type { GraphDefinition } from "@/graph/types";

import { GraphDefinitionSchema } from "@/graph/types";

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null && !Array.isArray(value);
};

const parseMaybeJson = (input: unknown): unknown => {
  if (typeof input !== "string") {
    return input;
  }

  const trimmed = input.trim();
  if (trimmed.length === 0) {
    throw new Error("Graph DSL JSON string is empty");
  }

  return JSON.parse(trimmed);
};

const normalizeNodes = (nodesLike: unknown): unknown => {
  if (Array.isArray(nodesLike)) {
    const nodesRecord = nodesLike.reduce<Record<string, unknown>>(
      (acc, nodeLike) => {
        if (!isRecord(nodeLike)) return acc;

        const nodeId =
          typeof nodeLike.id === "string" && nodeLike.id.trim().length > 0
            ? nodeLike.id.trim()
            : "";

        if (nodeId.length === 0) return acc;

        acc[nodeId] = nodeLike;
        return acc;
      },
      {},
    );

    return nodesRecord;
  }

  return nodesLike;
};

export const parseGraphDSL = (input: unknown): GraphDefinition => {
  const parsed = parseMaybeJson(input);
  if (!isRecord(parsed)) {
    throw new Error("Graph DSL root must be an object");
  }

  const normalized = {
    ...parsed,
    nodes: normalizeNodes(parsed.nodes),
  };

  return GraphDefinitionSchema.parse(normalized);
};
