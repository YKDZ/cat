import * as z from "zod/v4";

import { defineClientTool } from "@/tools/types";

/**
 * Read the current editor context: active element ID, source text,
 * current translation, language, document ID, etc.
 */
export const getEditorContextTool = defineClientTool({
  name: "get_editor_context",
  description:
    "Get the current editor context including the active element ID, " +
    "source text, current translation value, source/target language IDs, " +
    "and document ID. Returns null values for fields that are not available.",
  parameters: z.object({}),
  confirmationPolicy: "auto_allow",
});
