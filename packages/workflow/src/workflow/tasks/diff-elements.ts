import {
  diffStructuredContentOp,
  DiffStructuredContentInputSchema,
  DiffStructuredContentOutputSchema,
} from "@cat/operations";

import { defineNode, defineGraph } from "@/graph/dsl";

export { DiffStructuredContentInputSchema, DiffStructuredContentOutputSchema };

export const diffElementsGraph = defineGraph({
  id: "element-diff",
  input: DiffStructuredContentInputSchema,
  output: DiffStructuredContentOutputSchema,
  nodes: {
    main: defineNode({
      input: DiffStructuredContentInputSchema,
      output: DiffStructuredContentOutputSchema,
      handler: async (input, ctx) =>
        diffStructuredContentOp(input, {
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
