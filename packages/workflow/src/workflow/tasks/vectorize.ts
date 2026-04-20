import {
  vectorizeToChunkSetOp,
  VectorizeInputSchema,
  VectorizeOutputSchema,
} from "@cat/operations";

import { defineNode, defineGraph } from "@/graph/dsl";

export { VectorizeInputSchema, VectorizeOutputSchema };

export const vectorizeGraph = defineGraph({
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
