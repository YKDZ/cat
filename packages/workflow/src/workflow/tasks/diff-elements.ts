import {
  diffElementsOp,
  DiffElementsInputSchema,
  DiffElementsOutputSchema,
} from "@cat/operations";

import { defineNode, defineGraph } from "@/graph/dsl";

export { DiffElementsInputSchema, DiffElementsOutputSchema };

export const diffElementsGraph = defineGraph({
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
