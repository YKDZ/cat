import {
  parseFileOp,
  ParseFileInputSchema,
  ParseFileOutputSchema,
} from "@cat/operations";

import { defineNode, defineTypedGraph } from "@/graph/typed-dsl";

export { ParseFileInputSchema, ParseFileOutputSchema };

export const parseFileGraph = defineTypedGraph({
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

/** @deprecated use parseFileGraph */
export const parseFileTask = parseFileGraph;
