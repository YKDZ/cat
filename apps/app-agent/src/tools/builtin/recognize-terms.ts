import {
  RecognizeTermInputSchema,
  recognizeTermOp,
} from "@cat/app-server-shared/operations";

import { defineTool } from "@/tools/types";

export const recognizeTermsTool = defineTool({
  name: "recognize_terms",
  description:
    "Recognize and extract terminology from text using vector similarity " +
    "matching against glossary entries. Returns matched terms with their translations.",
  parameters: RecognizeTermInputSchema,
  /**
   * This tool chains two sequential OpenAI API calls (term extraction + vectorization),
   * so the effective wall-clock time can reach 20–30 s. Override the global 15 s default.
   */
  timeoutMs: 80_000,
  execute: async (args, ctx) => {
    return recognizeTermOp(args, {
      traceId: ctx.traceId,
      signal: ctx.signal,
    });
  },
});
