import { and, eq, translationVote } from "@cat/db";
import { assertSingleOrNull } from "@cat/shared/utils";
import * as z from "zod/v4";

import type { Query } from "@/types";

export const GetSelfTranslationVoteQuerySchema = z.object({
  translationId: z.int(),
  voterId: z.uuidv4(),
});

export type GetSelfTranslationVoteQuery = z.infer<
  typeof GetSelfTranslationVoteQuerySchema
>;

export const getSelfTranslationVote: Query<
  GetSelfTranslationVoteQuery,
  typeof translationVote.$inferSelect | null
> = async (ctx, query) => {
  return assertSingleOrNull(
    await ctx.db
      .select()
      .from(translationVote)
      .where(
        and(
          eq(translationVote.translationId, query.translationId),
          eq(translationVote.voterId, query.voterId),
        ),
      ),
  );
};
