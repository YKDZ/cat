import {
  retrieveEmbeddingsOp,
  RetrieveEmbeddingsInputSchema,
  RetrieveEmbeddingsOutputSchema,
} from "@cat/app-server-shared/operations";

import { defineTask } from "@/core";

// Backward-compat re-exports (original typo spelling)
export {
  RetrieveEmbeddingsInputSchema as RetriveEmbeddingsInputSchema,
  RetrieveEmbeddingsOutputSchema as RetriveEmbeddingsOutputSchema,
};

export const retriveEmbeddingsTask = await defineTask({
  name: "embeddings.retrive",
  input: RetrieveEmbeddingsInputSchema,
  output: RetrieveEmbeddingsOutputSchema,

  cache: {
    enabled: true,
  },

  handler: async (data, ctx) => retrieveEmbeddingsOp(data, ctx),
});
