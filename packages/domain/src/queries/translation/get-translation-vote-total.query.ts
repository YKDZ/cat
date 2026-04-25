import { eq, sum, translationVote } from "@cat/db";
import { assertSingleNonNullish } from "@cat/shared";
import * as z from "zod";

import type { Query } from "@/types";

export const GetTranslationVoteTotalQuerySchema = z.object({
  translationId: z.int(),
});

export type GetTranslationVoteTotalQuery = z.infer<
  typeof GetTranslationVoteTotalQuerySchema
>;

export const getTranslationVoteTotal: Query<
  GetTranslationVoteTotalQuery,
  number
> = async (ctx, query) => {
  const row = assertSingleNonNullish(
    await ctx.db
      .select({ total: sum(translationVote.value) })
      .from(translationVote)
      .where(eq(translationVote.translationId, query.translationId)),
  );

  if (!row.total) {
    return 0;
  }

  return Number(row.total);
};
