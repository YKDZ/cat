import type { AgentToolDefinition } from "@/tools/types";

import { fetchTranslationSuggestionTool } from "./fetch-translation-suggestion";
import { finishTaskTool } from "./finish-task";
import { getElementInfoTool } from "./get-element-info";
import { getUserTranslationHistoryTool } from "./get-user-translation-history";
import { lookupTermsTool } from "./lookup-terms";
import { recognizeTermsTool } from "./recognize-terms";
import { runQACheckTool } from "./run-qa-check";
import { searchTranslationMemoryTool } from "./search-translation-memory";
import { tokenizeTextTool } from "./tokenize-text";

export {
  fetchTranslationSuggestionTool,
  finishTaskTool,
  getElementInfoTool,
  getUserTranslationHistoryTool,
  lookupTermsTool,
  recognizeTermsTool,
  runQACheckTool,
  searchTranslationMemoryTool,
  tokenizeTextTool,
};
export { FINISH_TOOL_NAME } from "./finish-task";

/** All built-in agent tools */
export const builtinTools: AgentToolDefinition[] = [
  finishTaskTool,
  fetchTranslationSuggestionTool,
  getElementInfoTool,
  getUserTranslationHistoryTool,
  lookupTermsTool,
  recognizeTermsTool,
  runQACheckTool,
  searchTranslationMemoryTool,
  tokenizeTextTool,
];
