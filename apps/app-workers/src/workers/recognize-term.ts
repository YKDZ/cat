import {
  recognizeTermOp,
  RecognizeTermInputSchema,
  RecognizeTermOutputSchema,
} from "@cat/app-server-shared/operations";

import { defineTask } from "@/core";

export { RecognizeTermInputSchema, RecognizeTermOutputSchema };

export const recognizeTermTask = await defineTask({
  name: "term.recognize",
  input: RecognizeTermInputSchema,
  output: RecognizeTermOutputSchema,

  cache: {
    enabled: true,
    ttl: 3600,
  },

  handler: async (data, ctx) => recognizeTermOp(data, ctx),
});
