import {
  vectorizeToChunkSetOp,
  VectorizeInputSchema,
  VectorizeOutputSchema,
} from "@cat/operations";

import { defineNode, defineTypedGraph } from "@/graph/typed-dsl";

export { VectorizeInputSchema, VectorizeOutputSchema };

export const vectorizeGraph = defineTypedGraph({
  id: "vectorize",
  input: VectorizeInputSchema,
  output: VectorizeOutputSchema,
  nodes: {
    main: defineNode({
      input: VectorizeInputSchema,
      output: VectorizeOutputSchema,
      handler: async (input, ctx) =>
        vectorizeToChunkSetOp(input, {
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

/** @deprecated use vectorizeGraph */
export const vectorizeToChunkSetTask = vectorizeGraph;
