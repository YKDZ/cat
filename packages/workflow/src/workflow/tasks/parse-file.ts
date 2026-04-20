import {
  parseFileOp,
  ParseFileInputSchema,
  ParseFileOutputSchema,
} from "@cat/operations";

import { defineNode, defineGraph } from "@/graph/dsl";

export { ParseFileInputSchema, ParseFileOutputSchema };

export const parseFileGraph = defineGraph({
  id: "file-parse",
  input: ParseFileInputSchema,
  output: ParseFileOutputSchema,
  nodes: {
    main: defineNode({
      input: ParseFileInputSchema,
      output: ParseFileOutputSchema,
      handler: async (input, ctx) =>
        parseFileOp(input, { traceId: ctx.traceId, signal: ctx.signal }),
    }),
  },
  edges: [],
  entry: "main",
  exit: ["main"],
});
