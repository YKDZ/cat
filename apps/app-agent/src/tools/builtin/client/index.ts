import type { AgentToolDefinition } from "@/tools/types";

import { clearTranslationTool } from "./clear-translation";
import { getEditorContextTool } from "./get-editor-context";
import { getTranslationValueTool } from "./get-translation-value";
import { insertTextTool } from "./insert-text";
import { navigateToElementTool } from "./navigate-to-element";
import { navigateToNextUntranslatedTool } from "./navigate-to-next-untranslated";
import { redoTranslationTool } from "./redo-translation";
import { replaceTranslationTool } from "./replace-translation";
import { submitTranslationTool } from "./submit-translation";
import { undoTranslationTool } from "./undo-translation";

export const builtinClientTools: AgentToolDefinition[] = [
  getTranslationValueTool,
  getEditorContextTool,
  replaceTranslationTool,
  insertTextTool,
  clearTranslationTool,
  submitTranslationTool,
  navigateToElementTool,
  navigateToNextUntranslatedTool,
  undoTranslationTool,
  redoTranslationTool,
];

export {
  clearTranslationTool,
  getEditorContextTool,
  getTranslationValueTool,
  insertTextTool,
  navigateToElementTool,
  navigateToNextUntranslatedTool,
  redoTranslationTool,
  replaceTranslationTool,
  submitTranslationTool,
  undoTranslationTool,
};
