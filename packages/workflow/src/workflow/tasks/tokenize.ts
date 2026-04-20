import {
  tokenizeOp,
  TokenizeInputSchema,
  TokenizeOutputSchema,
} from "@cat/operations";

import { defineNode, defineGraph } from "@/graph/dsl";

export { TokenizeInputSchema, TokenizeOutputSchema };

export const tokenizeGraph = defineGraph({
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
