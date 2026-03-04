import {
  FetchAdviseInputSchema,
  fetchAdviseOp,
} from "@cat/app-server-shared/operations";

import { defineTool } from "@/tools/types";

export const fetchTranslationSuggestionTool = defineTool({
  name: "fetch_translation_suggestion",
  description:
    "Fetch machine translation suggestions for a given text. " +
    "Supports term-aware translation by providing glossary IDs.",
  parameters: FetchAdviseInputSchema,
  execute: async (args, ctx) => {
    return fetchAdviseOp(args, { traceId: ctx.traceId, signal: ctx.signal });
  },
});
