import * as z from "zod/v4";

import { defineClientTool } from "@/tools/types";

/** Replace the entire translation value of the active element. */
export const replaceTranslationTool = defineClientTool({
  name: "replace_translation",
  description:
    "Replace the entire translation text of the active element in the editor " +
    "with the specified value. This overwrites the current content completely.",
  parameters: z.object({
    value: z.string().describe("The new translation text to set."),
  }),
  confirmationPolicy: "session_trust",
});
