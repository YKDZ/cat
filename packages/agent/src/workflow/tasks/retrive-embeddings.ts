import {
  retrieveEmbeddingsOp,
  RetrieveEmbeddingsInputSchema,
  RetrieveEmbeddingsOutputSchema,
} from "@cat/operations";

import { defineNode, defineTypedGraph } from "@/graph/typed-dsl";

export {
  RetrieveEmbeddingsInputSchema as RetriveEmbeddingsInputSchema,
  RetrieveEmbeddingsOutputSchema as RetriveEmbeddingsOutputSchema,
};

export const retriveEmbeddingsGraph = defineTypedGraph({
  id: "embeddings-retrive",
  input: RetrieveEmbeddingsInputSchema,
  output: RetrieveEmbeddingsOutputSchema,
  nodes: {
    main: defineNode({
      input: RetrieveEmbeddingsInputSchema,
      output: RetrieveEmbeddingsOutputSchema,
      handler: async (input, ctx) =>
        retrieveEmbeddingsOp(input, {
          traceId: ctx.traceId,
          signal: ctx.signal,
        }),
    }),
  },
  edges: [],
  entry: "main",
  exit: ["main"],
});

/** @deprecated use retriveEmbeddingsGraph */
export const retriveEmbeddingsTask = retriveEmbeddingsGraph;
