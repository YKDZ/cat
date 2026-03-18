import * as z from "zod/v4";

import { defineClientTool } from "@/tools/types";

/** Insert text at the cursor position in the active translation editor. */
export const insertTextTool = defineClientTool({
  name: "insert_text",
  description:
    "Insert text at the current cursor position in the editor's translation " +
    "textarea. If text is selected, it will be replaced by the inserted text.",
  parameters: z.object({
    value: z.string().describe("The text to insert at the cursor position."),
  }),
  confirmationPolicy: "session_trust",
});
