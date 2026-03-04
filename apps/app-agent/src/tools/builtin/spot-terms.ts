import {
  SpotTermInputSchema,
  spotTermOp,
} from "@cat/app-server-shared/operations";

import { defineTool } from "@/tools/types";

export const spotTermsTool = defineTool({
  name: "spot_terms",
  description:
    "Discover terminology candidates from text using term extraction plugins. " +
    "Returns raw term candidates with text ranges.",
  parameters: SpotTermInputSchema,
  execute: async (args, ctx) => {
    return spotTermOp(args, { traceId: ctx.traceId, signal: ctx.signal });
  },
});
