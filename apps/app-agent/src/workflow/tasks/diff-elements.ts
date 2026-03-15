import {
  diffElementsOp,
  DiffElementsInputSchema,
  DiffElementsOutputSchema,
} from "@cat/operations";

import { defineGraphTask } from "@/workflow/define-task";

export { DiffElementsInputSchema, DiffElementsOutputSchema };

export const diffElementsTask = defineGraphTask({
  name: "element.diff",
  input: DiffElementsInputSchema,
  output: DiffElementsOutputSchema,
  handler: async (payload, ctx) => diffElementsOp(payload, ctx),
});
