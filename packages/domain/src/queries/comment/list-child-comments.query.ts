import { and, comment, desc, eq, isNotNull } from "@cat/db";
import * as z from "zod/v4";

import type { Query } from "@/types";

export const ListChildCommentsQuerySchema = z.object({
  rootCommentId: z.int(),
});

export type ListChildCommentsQuery = z.infer<
  typeof ListChildCommentsQuerySchema
>;

export const listChildComments: Query<
  ListChildCommentsQuery,
  Array<typeof comment.$inferSelect>
> = async (ctx, query) => {
  return ctx.db
    .select()
    .from(comment)
    .where(
      and(
        eq(comment.rootCommentId, query.rootCommentId),
        isNotNull(comment.parentCommentId),
      ),
    )
    .orderBy(desc(comment.createdAt));
};
