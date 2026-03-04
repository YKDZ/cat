import {
  revectorizeOp,
  RevectorizeInputSchema,
  RevectorizeOutputSchema,
} from "@cat/app-server-shared/operations";

import { defineTask } from "@/core";

export { RevectorizeInputSchema, RevectorizeOutputSchema };

export const revectorizeTask = await defineTask({
  name: "revectorizer",
  input: RevectorizeInputSchema,
  output: RevectorizeOutputSchema,

  handler: async (data, ctx) => revectorizeOp(data, ctx),
});
