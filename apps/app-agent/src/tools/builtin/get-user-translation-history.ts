import {
  ListUserTranslationHistoryResultSchema,
  listUserTranslationHistory,
} from "@cat/domain";
import * as z from "zod";

import { runAgentQuery } from "@/db/domain";
import { defineTool } from "@/tools/types";

const DEFAULT_PAGE_SIZE = 20;

const InputSchema = z.object({
  projectId: z.uuidv4(),
  userId: z.uuidv4(),
  sourceLanguageId: z.string().optional(),
  translationLanguageId: z.string().optional(),
  /** Cursor: the translationId of the last item from the previous page. Omit for the first page. */
  cursor: z.int().positive().optional().meta({
    description:
      "Cursor for pagination. Pass the translationId of the last item from the previous page. Omit for the first page.",
  }),
  /** Number of items per page (default: 20, max: 32). */
  limit: z.int().min(1).max(32).default(DEFAULT_PAGE_SIZE),
});

const OutputSchema = ListUserTranslationHistoryResultSchema;

type Input = z.infer<typeof InputSchema>;
type Output = z.infer<typeof OutputSchema>;

/**
 * Retrieve user's translation history with cursor-based pagination.
 * Returns a page of source texts and their translations, ordered by translation ID ascending.
 * Use `nextCursor` from the response as `cursor` in the next request to fetch subsequent pages.
 * Optionally filters by source and target language.
 */
const getUserTranslationHistoryOp = async (data: Input): Promise<Output> => {
  return runAgentQuery(listUserTranslationHistory, data);
};

export const getUserTranslationHistoryTool = defineTool({
  name: "get_user_translation_history",
  description:
    "Retrieve user's translation history with cursor-based pagination. " +
    "Returns a page of source/translation pairs ordered by translation ID. " +
    "Pass the returned `nextCursor` as `cursor` in the next call to get the next page (null and hasMore = false means no more pages). " +
    "Optionally filters by source language and/or target language.",
  parameters: InputSchema,
  execute: async (args) => {
    return getUserTranslationHistoryOp(args);
  },
});
