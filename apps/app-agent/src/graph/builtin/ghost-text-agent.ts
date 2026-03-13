import type { GraphDefinition } from "@/graph/types";

export const ghostTextAgentGraph: GraphDefinition = {
  id: "ghost-text-agent",
  version: "1.0.0",
  description: "Ghost text FIM flow graph (MVP)",
  nodes: {
    complete: {
      id: "complete",
      type: "llm",
      config: {
        messagesPath: "messages",
        responsePath: "completion.content",
      },
      timeoutMs: 120_000,
    },
  },
  edges: [],
  entry: "complete",
  exit: ["complete"],
};
