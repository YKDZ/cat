import { SpotTermInputSchema, spotTermOp } from "@cat/operations";

import { defineTool } from "@/tools/types";

export const spotTermsTool = defineTool({
  name: "spot_terms",
  description:
    "Extract terminology candidates from a text passage using NLP/LLM. " +
    "Returns candidate terms with their positions in the source text. " +
    "Use this as the first step when analyzing a full sentence or paragraph for terms — " +
    "then feed each candidate into lookup_terms to check if the glossary contains a translation. " +
    "For single known keywords, use lookup_terms directly instead.",
  parameters: SpotTermInputSchema,
  execute: async (args, ctx) => {
    return spotTermOp(args, { traceId: ctx.traceId, signal: ctx.signal });
  },
});
