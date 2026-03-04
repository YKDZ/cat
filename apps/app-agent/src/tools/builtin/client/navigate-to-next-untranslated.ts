import * as z from "zod/v4";

import { defineClientTool } from "@/tools/types";

/** Navigate the editor to the next untranslated element. */
export const navigateToNextUntranslatedTool = defineClientTool({
  name: "navigate_to_next_untranslated",
  description:
    "Navigate the editor to the next untranslated element after the current one. " +
    "Useful for sequentially working through untranslated content.",
  parameters: z.object({}),
  confirmationPolicy: "auto_allow",
});
