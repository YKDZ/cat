import {
  nlpBatchSegmentOp,
  nlpSegmentOp,
  NlpBatchSegmentInputSchema,
  NlpBatchSegmentOutputSchema,
  NlpSegmentInputSchema,
  NlpSegmentOutputSchema,
} from "@cat/operations";

import { defineGraphTask } from "@/workflow/define-task";

export {
  NlpSegmentInputSchema,
  NlpSegmentOutputSchema,
  NlpBatchSegmentInputSchema,
  NlpBatchSegmentOutputSchema,
};

export const nlpSegmentTask = defineGraphTask({
  name: "nlp.segment",
  input: NlpSegmentInputSchema,
  output: NlpSegmentOutputSchema,
  cache: { enabled: true, ttl: 3600 },
  handler: async (payload, ctx) => nlpSegmentOp(payload, ctx),
});

export const nlpBatchSegmentTask = defineGraphTask({
  name: "nlp.batchSegment",
  input: NlpBatchSegmentInputSchema,
  output: NlpBatchSegmentOutputSchema,
  cache: { enabled: true, ttl: 3600 },
  handler: async (payload, ctx) => nlpBatchSegmentOp(payload, ctx),
});
