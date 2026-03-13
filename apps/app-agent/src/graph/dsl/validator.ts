import * as z from "zod/v4";

import type { GraphDefinition } from "@/graph/types";

import { parseGraphDSL } from "./parser";

export type GraphDSLValidationResult =
  | { success: true; data: GraphDefinition }
  | { success: false; error: z.ZodError };

const semanticValidate = (
  graph: GraphDefinition,
): { ok: true } | { ok: false; message: string } => {
  const nodeIds = new Set(Object.keys(graph.nodes));

  if (!nodeIds.has(graph.entry)) {
    return {
      ok: false,
      message: `Graph entry node not found: ${graph.entry}`,
    };
  }

  if (Array.isArray(graph.exit)) {
    for (const exitNodeId of graph.exit) {
      if (!nodeIds.has(exitNodeId)) {
        return {
          ok: false,
          message: `Graph exit node not found: ${exitNodeId}`,
        };
      }
    }
  }

  for (const edge of graph.edges) {
    if (!nodeIds.has(edge.from)) {
      return {
        ok: false,
        message: `Edge source node not found: ${edge.from}`,
      };
    }

    if (!nodeIds.has(edge.to)) {
      return {
        ok: false,
        message: `Edge target node not found: ${edge.to}`,
      };
    }
  }

  return { ok: true };
};

export const validateGraphDSL = (input: unknown): GraphDSLValidationResult => {
  try {
    const graph = parseGraphDSL(input);
    const semantic = semanticValidate(graph);

    if (!semantic.ok) {
      return {
        success: false,
        error: new z.ZodError([
          {
            code: "custom",
            path: [],
            message: semantic.message,
            input,
          },
        ]),
      };
    }

    return {
      success: true,
      data: graph,
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        success: false,
        error,
      };
    }

    return {
      success: false,
      error: new z.ZodError([
        {
          code: "custom",
          path: [],
          message: error instanceof Error ? error.message : String(error),
          input,
        },
      ]),
    };
  }
};
