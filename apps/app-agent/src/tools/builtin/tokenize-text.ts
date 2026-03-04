import {
  TokenizeInputSchema,
  tokenizeOp,
} from "@cat/app-server-shared/operations";

import { defineTool } from "@/tools/types";

export const tokenizeTextTool = defineTool({
  name: "tokenize_text",
  description:
    "Tokenize text into individual tokens using available tokenizer plugins.",
  parameters: TokenizeInputSchema,
  execute: async (args, ctx) => {
    return tokenizeOp(args, { traceId: ctx.traceId, signal: ctx.signal });
  },
});
