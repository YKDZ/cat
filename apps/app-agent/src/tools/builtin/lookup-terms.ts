import { LookupTermsInputSchema } from "@cat/operations";
import { listLexicalTermSuggestions } from "@cat/domain";

import { runAgentQuery } from "@/db/domain";
import { defineTool } from "@/tools/types";

export const lookupTermsTool = defineTool({
  name: "lookup_terms",
  description:
    "Fast lexical glossary lookup using SQL ILIKE matching. " +
    "Use this when you have a specific term or keyword to look up (e.g. '嗅探兽', 'photon'). " +
    "Also accepts short phrases. No LLM or vector search \u2014 returns results in milliseconds. " +
    "For full-sentence term discovery, first use spot_terms to extract candidates, " +
    "then call lookup_terms for each candidate.",
  parameters: LookupTermsInputSchema,
  execute: async (args) => {
    return runAgentQuery(listLexicalTermSuggestions, {
      glossaryIds: args.glossaryIds,
      text: args.text,
      sourceLanguageId: args.sourceLanguageId,
      translationLanguageId: args.translationLanguageId,
      wordSimilarityThreshold: args.wordSimilarityThreshold ?? 0.3,
    });
  },
});
