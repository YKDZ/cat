import {
  parseFileOp,
  ParseFileInputSchema,
  ParseFileOutputSchema,
} from "@cat/app-server-shared/operations";

import { defineTask } from "@/core";

export { ParseFileInputSchema, ParseFileOutputSchema };

export const parseFileTask = await defineTask({
  name: "file.parse",
  input: ParseFileInputSchema,
  output: ParseFileOutputSchema,

  cache: {
    enabled: true,
  },

  handler: async (data, ctx) => parseFileOp(data, ctx),
});
