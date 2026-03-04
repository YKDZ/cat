import {
  SearchMemoryInputSchema,
  searchMemoryOp,
} from "@cat/app-server-shared/operations";

import { defineTool } from "@/tools/types";

export const searchTranslationMemoryTool = defineTool({
  name: "search_translation_memory",
  description:
    "Search translation memory for previously translated similar segments. " +
    "Returns matching translations ranked by similarity score.",
  parameters: SearchMemoryInputSchema,
  execute: async (args, ctx) => {
    return searchMemoryOp(args, { traceId: ctx.traceId, signal: ctx.signal });
  },
});
