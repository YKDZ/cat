import { eq, getColumns, qaReviewSuggestion } from "@cat/db";
import * as z from "zod";

import type { Query } from "@/types";

export const GetQaReviewSuggestionQuerySchema = z.object({
  suggestionId: z.int().positive(),
});

export type GetQaReviewSuggestionQuery = z.infer<
  typeof GetQaReviewSuggestionQuerySchema
>;

/**
 * Fetch a single QA review suggestion by ID.
 */
export const getQaReviewSuggestion: Query<
  GetQaReviewSuggestionQuery,
  typeof qaReviewSuggestion.$inferSelect | null
> = async (ctx, input) => {
  const query = GetQaReviewSuggestionQuerySchema.parse(input);
  const rows = await ctx.db
    .select({ ...getColumns(qaReviewSuggestion) })
    .from(qaReviewSuggestion)
    .where(eq(qaReviewSuggestion.id, query.suggestionId))
    .limit(1);

  return rows[0] ?? null;
};
