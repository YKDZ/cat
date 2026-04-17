import { asc, eq, getColumns, issueComment } from "@cat/db";
import * as z from "zod/v4";

import type { Query } from "@/types";

export const ListCommentsQuerySchema = z.object({
  threadId: z.int().positive(),
});

export type ListCommentsQuery = z.infer<typeof ListCommentsQuerySchema>;

export const listComments: Query<
  ListCommentsQuery,
  (typeof issueComment.$inferSelect)[]
> = async (ctx, query) => {
  return ctx.db
    .select({ ...getColumns(issueComment) })
    .from(issueComment)
    .where(eq(issueComment.threadId, query.threadId))
    .orderBy(asc(issueComment.createdAt));
};
