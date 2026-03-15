import {
  tokenizeOp,
  TokenizeInputSchema,
  TokenizeOutputSchema,
} from "@cat/operations";

import { defineGraphTask } from "@/workflow/define-task";

export { TokenizeInputSchema, TokenizeOutputSchema };

export const tokenizeTask = defineGraphTask({
  name: "tokenizer",
  input: TokenizeInputSchema,
  output: TokenizeOutputSchema,
  cache: {
    enabled: true,
  },
  handler: async (payload, ctx) => tokenizeOp(payload, ctx),
});
