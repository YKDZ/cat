import {
  spotTermOp,
  SpotTermInputSchema,
  SpotTermOutputSchema,
} from "@cat/operations";

import { defineGraphTask } from "@/workflow/define-task";

export { SpotTermInputSchema, SpotTermOutputSchema };

export const spotTermTask = defineGraphTask({
  name: "term.spot",
  input: SpotTermInputSchema,
  output: SpotTermOutputSchema,
  cache: {
    enabled: true,
    ttl: 3600,
  },
  handler: async (payload, ctx) => spotTermOp(payload, ctx),
});
