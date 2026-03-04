import * as z from "zod/v4";

import { defineClientTool } from "@/tools/types";

/**
 * Navigate the editor to a specific translatable element by ID.
 * Optionally switch to a different document / language first.
 */
export const navigateToElementTool = defineClientTool({
  name: "navigate_to_element",
  description:
    "Navigate the editor to a specific translatable element by its numeric ID. " +
    "This will change the active element and load the corresponding page. " +
    "You can optionally provide documentId and languageId to jump to an element in a different document.",
  parameters: z.object({
    elementId: z
      .int()
      .describe("The numeric ID of the element to navigate to."),
    documentId: z
      .string()
      .optional()
      .describe(
        "Optional document ID. When provided, the editor will navigate to this document first.",
      ),
    languageId: z
      .string()
      .optional()
      .describe(
        "Optional target language ID. When provided together with documentId, switches language context.",
      ),
  }),
  confirmationPolicy: "session_trust",
});
