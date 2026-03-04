import {
  tokenizeOp,
  TokenizeInputSchema,
  TokenizeOutputSchema,
} from "@cat/app-server-shared/operations";

import { defineTask } from "@/core";

export { TokenizeInputSchema, TokenizeOutputSchema };

export const tokenizeTask = await defineTask({
  name: "tokenizer",
  input: TokenizeInputSchema,
  output: TokenizeOutputSchema,

  cache: {
    enabled: true,
  },

  handler: async (payload, ctx) => tokenizeOp(payload, ctx),
});
