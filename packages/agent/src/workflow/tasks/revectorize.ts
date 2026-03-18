import {
  revectorizeOp,
  RevectorizeInputSchema,
  RevectorizeOutputSchema,
} from "@cat/operations";

import { defineGraphTask } from "@/workflow/define-task";

export { RevectorizeInputSchema, RevectorizeOutputSchema };

export const revectorizeTask = defineGraphTask({
  name: "revectorizer",
  input: RevectorizeInputSchema,
  output: RevectorizeOutputSchema,
  handler: async (payload, ctx) => revectorizeOp(payload, ctx),
});
