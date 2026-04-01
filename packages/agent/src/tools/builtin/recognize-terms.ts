import { termRecallOp, TermRecallInputSchema } from "@cat/operations";

import { defineTool } from "@/tools/types";

export const recognizeTermsTool = defineTool({
  name: "recognize_terms",
  description:
    "Scan a full sentence or paragraph and identify all related glossary terms using " +
    "lexical matching (ILIKE + word_similarity). Returns enriched term matches with " +
    "concept subjects and definitions. Use this when you need to discover which terms " +
    "from the glossary appear in a piece of text.",
  parameters: TermRecallInputSchema,
  execute: async (args) => {
    const result = await termRecallOp(args);
    return result;
  },
});
