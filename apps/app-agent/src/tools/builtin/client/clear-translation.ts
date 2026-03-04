import * as z from "zod/v4";

import { defineClientTool } from "@/tools/types";

/** Clear the translation value of the active element. */
export const clearTranslationTool = defineClientTool({
  name: "clear_translation",
  description:
    "Clear (empty) the translation text of the active element in the editor.",
  parameters: z.object({}),
  confirmationPolicy: "session_trust",
});
