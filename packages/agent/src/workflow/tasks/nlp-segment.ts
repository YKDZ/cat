import {
  nlpBatchSegmentOp,
  nlpSegmentOp,
  NlpBatchSegmentInputSchema,
  NlpBatchSegmentOutputSchema,
  NlpSegmentInputSchema,
  NlpSegmentOutputSchema,
} from "@cat/operations";

import { defineNode, defineTypedGraph } from "@/graph/typed-dsl";

export {
  NlpSegmentInputSchema,
  NlpSegmentOutputSchema,
  NlpBatchSegmentInputSchema,
  NlpBatchSegmentOutputSchema,
};

export const nlpSegmentGraph = defineTypedGraph({
  id: "nlp-segment",
  input: NlpSegmentInputSchema,
  output: NlpSegmentOutputSchema,
  nodes: {
    main: defineNode({
      input: NlpSegmentInputSchema,
      output: NlpSegmentOutputSchema,
      handler: async (input, ctx) =>
        nlpSegmentOp(input, {
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

export const nlpBatchSegmentGraph = defineTypedGraph({
  id: "nlp-batch-segment",
  input: NlpBatchSegmentInputSchema,
  output: NlpBatchSegmentOutputSchema,
  nodes: {
    main: defineNode({
      input: NlpBatchSegmentInputSchema,
      output: NlpBatchSegmentOutputSchema,
      handler: async (input, ctx) =>
        nlpBatchSegmentOp(input, {
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

/** @deprecated use nlpSegmentGraph */
export const nlpSegmentTask = nlpSegmentGraph;
/** @deprecated use nlpBatchSegmentGraph */
export const nlpBatchSegmentTask = nlpBatchSegmentGraph;
