import { commentReaction, eq } from "@cat/db";
import * as z from "zod/v4";

import type { Query } from "@/types";

export const ListCommentReactionsQuerySchema = z.object({
  commentId: z.int(),
});

export type ListCommentReactionsQuery = z.infer<
  typeof ListCommentReactionsQuerySchema
>;

export const listCommentReactions: Query<
  ListCommentReactionsQuery,
  Array<typeof commentReaction.$inferSelect>
> = async (ctx, query) => {
  return ctx.db
    .select()
    .from(commentReaction)
    .where(eq(commentReaction.commentId, query.commentId));
};
