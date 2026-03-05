import type { AgentToolDefinition } from "@/tools/types";

import { fetchTranslationSuggestionTool } from "./fetch-translation-suggestion";
import { finishTaskTool } from "./finish-task";
import { getElementInfoTool } from "./get-element-info";
import { getUserTranslationHistoryTool } from "./get-user-translation-history";
import { lookupTermsTool } from "./lookup-terms";
import { runQACheckTool } from "./run-qa-check";
import { searchTranslationMemoryTool } from "./search-translation-memory";
import { spotTermsTool } from "./spot-terms";
import { tokenizeTextTool } from "./tokenize-text";

export {
  fetchTranslationSuggestionTool,
  finishTaskTool,
  getElementInfoTool,
  getUserTranslationHistoryTool,
  lookupTermsTool,
  runQACheckTool,
  searchTranslationMemoryTool,
  spotTermsTool,
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
  runQACheckTool,
  searchTranslationMemoryTool,
  spotTermsTool,
  tokenizeTextTool,
];
