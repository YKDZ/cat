import {
  fetchAdviseOp,
  FetchAdviseInputSchema,
  FetchAdviseOutputSchema,
} from "@cat/app-server-shared/operations";

import { defineTask } from "@/core";

export { FetchAdviseInputSchema, FetchAdviseOutputSchema };

export const fetchAdviseWorkflow = await defineTask({
  name: "advise.fetch",
  input: FetchAdviseInputSchema,
  output: FetchAdviseOutputSchema,

  cache: {
    enabled: true,
    ttl: 3600,
  },

  handler: async (data, ctx) => fetchAdviseOp(data, ctx),
});
