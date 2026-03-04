import {
  diffElementsOp,
  DiffElementsInputSchema,
  DiffElementsOutputSchema,
} from "@cat/app-server-shared/operations";

import { defineTask } from "@/core";

export { DiffElementsInputSchema, DiffElementsOutputSchema };

export const diffElementsTask = await defineTask({
  name: "element.diff",
  input: DiffElementsInputSchema,
  output: DiffElementsOutputSchema,

  handler: async (data, ctx) => diffElementsOp(data, ctx),
});
