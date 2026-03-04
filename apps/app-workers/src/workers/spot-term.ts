import {
  spotTermOp,
  SpotTermInputSchema,
  SpotTermOutputSchema,
} from "@cat/app-server-shared/operations";

import { defineTask } from "@/core";

export { SpotTermInputSchema, SpotTermOutputSchema };

export const spotTermTask = await defineTask({
  name: "term.spot",
  input: SpotTermInputSchema,
  output: SpotTermOutputSchema,

  cache: {
    enabled: true,
    ttl: 3600,
  },

  handler: async (data, ctx) => spotTermOp(data, ctx),
});
