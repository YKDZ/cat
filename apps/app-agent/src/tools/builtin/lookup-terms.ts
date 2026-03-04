import {
  LookupTermInputSchema,
  lookupTermOp,
} from "@cat/app-server-shared/operations";

import { defineTool } from "@/tools/types";

export const lookupTermsTool = defineTool({
  name: "lookup_terms",
  description:
    "Fast lexical glossary lookup using SQL ILIKE matching. " +
    "Use this when the user provides a specific term name or short keyword (e.g. '\u55c5\u63a2\u517d', 'photon'). " +
    "No LLM or vector search \u2014 returns results in milliseconds. " +
    "Does NOT work well for long sentences; use recognize_terms for full-sentence inputs instead.",
  parameters: LookupTermInputSchema,
  execute: async (args, ctx) => {
    return lookupTermOp(args, { traceId: ctx.traceId, signal: ctx.signal });
  },
});
