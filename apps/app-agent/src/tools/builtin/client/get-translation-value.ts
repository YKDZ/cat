import * as z from "zod/v4";

import { defineClientTool } from "@/tools/types";

/** Read the current translation value from the editor textarea. */
export const getTranslationValueTool = defineClientTool({
  name: "get_translation_value",
  description:
    "Get the current translation text for the active element in the editor.",
  parameters: z.object({}),
  confirmationPolicy: "auto_allow",
});
