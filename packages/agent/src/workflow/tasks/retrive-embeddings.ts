import {
  retrieveEmbeddingsOp,
  RetrieveEmbeddingsInputSchema,
  RetrieveEmbeddingsOutputSchema,
} from "@cat/operations";

import { defineGraphTask } from "@/workflow/define-task";

export {
  RetrieveEmbeddingsInputSchema as RetriveEmbeddingsInputSchema,
  RetrieveEmbeddingsOutputSchema as RetriveEmbeddingsOutputSchema,
};

export const retriveEmbeddingsTask = defineGraphTask({
  name: "embeddings.retrive",
  input: RetrieveEmbeddingsInputSchema,
  output: RetrieveEmbeddingsOutputSchema,
  cache: {
    enabled: true,
  },
  handler: async (payload, ctx) => retrieveEmbeddingsOp(payload, ctx),
});
