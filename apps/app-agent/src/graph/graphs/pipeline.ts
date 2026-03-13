import type { GraphDefinition } from "@/graph/types";

export const pipelineGraph: GraphDefinition = {
  id: "pipeline",
  version: "1.0.0",
  description: "Sequential pipeline graph (MVP)",
  nodes: {
    stage_1: {
      id: "stage_1",
      type: "tool",
      timeoutMs: 120_000,
    },
    stage_2: {
      id: "stage_2",
      type: "tool",
      timeoutMs: 120_000,
    },
    finish: {
      id: "finish",
      type: "transform",
      timeoutMs: 30_000,
    },
  },
  edges: [
    { from: "stage_1", to: "stage_2" },
    { from: "stage_2", to: "finish" },
  ],
  entry: "stage_1",
  exit: ["finish"],
};
