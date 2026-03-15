import type { GraphDefinition } from "@/graph/types";

export const reactLoopGraph: GraphDefinition = {
  id: "react-loop",
  version: "1.0.0",
  description: "ReAct loop graph (MVP)",
  nodes: {
    think: {
      id: "think",
      type: "llm",
      config: {
        messagesPath: "messages",
        responsePath: "think.response",
      },
      timeoutMs: 120_000,
    },
    route: {
      id: "route",
      type: "router",
      config: {
        routes: [
          {
            condition: {
              type: "schema_match",
              value: "think.toolCalls.0",
            },
            target: "act",
            label: "has_tools",
          },
          {
            condition: {
              type: "blackboard_field",
              value: "think.finishRequested==true",
            },
            target: "finish",
            label: "finish",
          },
        ],
        defaultTarget: "finish",
      },
      timeoutMs: 30_000,
    },
    act: {
      id: "act",
      type: "tool",
      config: {
        toolNamePath: "think.toolCalls.0.name",
        toolCallIdPath: "think.toolCalls.0.id",
        argsPath: "think.toolCalls.0.arguments",
        resultPath: "act.result",
      },
      timeoutMs: 120_000,
    },
    finish: {
      id: "finish",
      type: "transform",
      timeoutMs: 30_000,
    },
  },
  edges: [
    { from: "think", to: "route" },
    {
      from: "route",
      to: "act",
      condition: {
        type: "blackboard_field",
        value: "__nextNode==act",
      },
    },
    {
      from: "route",
      to: "finish",
      condition: {
        type: "blackboard_field",
        value: "__nextNode==finish",
      },
    },
    { from: "act", to: "think" },
  ],
  entry: "think",
  exit: ["finish"],
  config: {
    maxConcurrentNodes: 3,
    defaultTimeoutMs: 120_000,
    enableCheckpoints: true,
    checkpointIntervalMs: 1000,
  },
};
