import {
  vectorizeToChunkSetOp,
  VectorizeInputSchema,
  VectorizeOutputSchema,
} from "@cat/operations";

import { defineGraphTask } from "@/workflow/define-task";

export { VectorizeInputSchema, VectorizeOutputSchema };

export const vectorizeToChunkSetTask = defineGraphTask({
  name: "vectorize",
  input: VectorizeInputSchema,
  output: VectorizeOutputSchema,
  cache: {
    enabled: true,
  },
  handler: async (payload, ctx) => vectorizeToChunkSetOp(payload, ctx),
});
