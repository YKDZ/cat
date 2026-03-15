import {
  revectorizeConceptOp,
  RevectorizeConceptInputSchema,
  RevectorizeConceptOutputSchema,
} from "@cat/operations";

import { defineGraphTask } from "@/workflow/define-task";

export { RevectorizeConceptInputSchema, RevectorizeConceptOutputSchema };

export const revectorizeConceptTask = defineGraphTask({
  name: "term.revectorize-concept",
  input: RevectorizeConceptInputSchema,
  output: RevectorizeConceptOutputSchema,
  handler: async (payload, ctx) => revectorizeConceptOp(payload, ctx),
});
