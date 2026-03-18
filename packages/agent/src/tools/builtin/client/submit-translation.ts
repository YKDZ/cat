import * as z from "zod/v4";

import { defineClientTool } from "@/tools/types";

/**
 * Submit (save) the current translation for the active element,
 * triggering QA checks and translation memory insertion.
 */
export const submitTranslationTool = defineClientTool({
  name: "submit_translation",
  description:
    "Submit (save) the current translation for the active element. " +
    "This triggers QA checks and translation memory insertion, " +
    "equivalent to the user pressing the submit button.",
  parameters: z.object({}),
  confirmationPolicy: "always_confirm",
});
