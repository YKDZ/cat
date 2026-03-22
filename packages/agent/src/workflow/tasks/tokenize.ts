import {
  tokenizeOp,
  TokenizeInputSchema,
  TokenizeOutputSchema,
} from "@cat/operations";

import { defineNode, defineTypedGraph } from "@/graph/typed-dsl";

export { TokenizeInputSchema, TokenizeOutputSchema };

export const tokenizeGraph = defineTypedGraph({
  id: "tokenizer",
  input: TokenizeInputSchema,
  output: TokenizeOutputSchema,
  nodes: {
    main: defineNode({
      input: TokenizeInputSchema,
      output: TokenizeOutputSchema,
      handler: async (input, ctx) =>
        tokenizeOp(input, {
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

/** @deprecated use tokenizeGraph */
export const tokenizeTask = tokenizeGraph;
