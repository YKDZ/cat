import {
  revectorizeConceptOp,
  RevectorizeConceptInputSchema,
  RevectorizeConceptOutputSchema,
} from "@cat/operations";

import { defineNode, defineGraph } from "@/graph/dsl";

export { RevectorizeConceptInputSchema, RevectorizeConceptOutputSchema };

export const revectorizeConceptGraph = defineGraph({
  id: "term-revectorize-concept",
  input: RevectorizeConceptInputSchema,
  output: RevectorizeConceptOutputSchema,
  nodes: {
    main: defineNode({
      input: RevectorizeConceptInputSchema,
      output: RevectorizeConceptOutputSchema,
      handler: async (input, ctx) =>
        revectorizeConceptOp(input, {
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
