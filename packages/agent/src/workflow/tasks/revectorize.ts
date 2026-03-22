import {
  revectorizeOp,
  RevectorizeInputSchema,
  RevectorizeOutputSchema,
} from "@cat/operations";

import { defineNode, defineTypedGraph } from "@/graph/typed-dsl";

export { RevectorizeInputSchema, RevectorizeOutputSchema };

export const revectorizeGraph = defineTypedGraph({
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

/** @deprecated use revectorizeGraph */
export const revectorizeTask = revectorizeGraph;
