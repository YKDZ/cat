import {
  vectorizeToChunkSetOp,
  VectorizeInputSchema,
  VectorizeOutputSchema,
} from "@cat/app-server-shared/operations";

import { defineTask } from "@/core";

export { VectorizeInputSchema, VectorizeOutputSchema };

export const vectorizeToChunkSetTask = await defineTask({
  name: "vectorize",
  input: VectorizeInputSchema,
  output: VectorizeOutputSchema,

  cache: {
    enabled: true,
  },

  handler: async (data, ctx) => vectorizeToChunkSetOp(data, ctx),
});
