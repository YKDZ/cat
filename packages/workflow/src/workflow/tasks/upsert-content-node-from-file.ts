import {
  UpsertContentNodeFromFileInputSchema,
  UpsertContentNodeFromFileOutputSchema,
  upsertContentNodeFromFileOp,
} from "@cat/operations";

import { defineGraph, defineNode } from "@/graph/dsl";

export {
  UpsertContentNodeFromFileInputSchema,
  UpsertContentNodeFromFileOutputSchema,
};

export const upsertContentNodeGraph = defineGraph({
  id: "upsert-content-node-from-file",
  input: UpsertContentNodeFromFileInputSchema,
  output: UpsertContentNodeFromFileOutputSchema,
  nodes: {
    main: defineNode({
      input: UpsertContentNodeFromFileInputSchema,
      output: UpsertContentNodeFromFileOutputSchema,
      handler: async (input, ctx) =>
        upsertContentNodeFromFileOp(input, {
          traceId: ctx.traceId,
          signal: ctx.signal,
          pluginManager: ctx.pluginManager,
        }),
    }),
  },
  edges: [],
  entry: "main",
  exit: ["main"],
});
