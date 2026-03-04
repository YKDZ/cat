import * as z from "zod/v4";

import { defineClientTool } from "@/tools/types";

/** Undo the last translation edit in the editor. */
export const undoTranslationTool = defineClientTool({
  name: "undo_translation",
  description:
    "Undo the last translation edit in the editor (Ctrl+Z equivalent).",
  parameters: z.object({}),
  confirmationPolicy: "auto_allow",
});
