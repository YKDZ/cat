import {
  revectorizeOp,
  RevectorizeInputSchema,
  RevectorizeOutputSchema,
} from "@cat/operations";

import { defineNode, defineGraph } from "@/graph/dsl";

export { RevectorizeInputSchema, RevectorizeOutputSchema };

export const revectorizeGraph = defineGraph({
  id: "revectorizer",
  input: RevectorizeInputSchema,
  output: RevectorizeOutputSchema,
  nodes: {
    main: defineNode({
      input: RevectorizeInputSchema,
      output: RevectorizeOutputSchema,
      handler: async (input, ctx) =>
        revectorizeOp(input, {
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
