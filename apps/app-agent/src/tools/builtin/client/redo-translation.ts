import * as z from "zod/v4";

import { defineClientTool } from "@/tools/types";

/** Redo a previously undone translation edit in the editor. */
export const redoTranslationTool = defineClientTool({
  name: "redo_translation",
  description:
    "Redo a previously undone translation edit in the editor (Ctrl+Y equivalent).",
  parameters: z.object({}),
  confirmationPolicy: "auto_allow",
});
