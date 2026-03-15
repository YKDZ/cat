import {
  parseFileOp,
  ParseFileInputSchema,
  ParseFileOutputSchema,
} from "@cat/operations";

import { defineGraphTask } from "@/workflow/define-task";

export { ParseFileInputSchema, ParseFileOutputSchema };

export const parseFileTask = defineGraphTask({
  name: "file.parse",
  input: ParseFileInputSchema,
  output: ParseFileOutputSchema,
  cache: {
    enabled: true,
  },
  handler: async (payload, ctx) => parseFileOp(payload, ctx),
});
