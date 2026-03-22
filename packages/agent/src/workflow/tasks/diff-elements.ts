import {
  diffElementsOp,
  DiffElementsInputSchema,
  DiffElementsOutputSchema,
} from "@cat/operations";

import { defineNode, defineTypedGraph } from "@/graph/typed-dsl";

export { DiffElementsInputSchema, DiffElementsOutputSchema };

export const diffElementsGraph = defineTypedGraph({
  id: "element-diff",
  input: DiffElementsInputSchema,
  output: DiffElementsOutputSchema,
  nodes: {
    main: defineNode({
      input: DiffElementsInputSchema,
      output: DiffElementsOutputSchema,
      handler: async (input, ctx) =>
        diffElementsOp(input, {
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
