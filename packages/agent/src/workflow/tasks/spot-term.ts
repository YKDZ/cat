import {
  spotTermOp,
  SpotTermInputSchema,
  SpotTermOutputSchema,
} from "@cat/operations";

import { defineNode, defineTypedGraph } from "@/graph/typed-dsl";

export { SpotTermInputSchema, SpotTermOutputSchema };

export const spotTermGraph = defineTypedGraph({
  id: "term-spot",
  input: SpotTermInputSchema,
  output: SpotTermOutputSchema,
  nodes: {
    main: defineNode({
      input: SpotTermInputSchema,
      output: SpotTermOutputSchema,
      handler: async (input, ctx) =>
        spotTermOp(input, {
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
