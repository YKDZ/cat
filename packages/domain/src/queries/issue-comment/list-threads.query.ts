import {
  and,
  asc,
  eq,
  getColumns,
  inArray,
  issueComment,
  issueCommentThread,
} from "@cat/db";
import * as z from "zod";

import type { Query } from "@/types";

export const ListThreadsQuerySchema = z.object({
  targetType: z.enum(["issue", "pr"]),
  targetId: z.int().positive(),
  isReviewThread: z.boolean().optional(),
});

export type ListThreadsQuery = z.infer<typeof ListThreadsQuerySchema>;

export const listThreads: Query<
  ListThreadsQuery,
  (typeof issueCommentThread.$inferSelect & {
    comments: (typeof issueComment.$inferSelect)[];
  })[]
> = async (ctx, query) => {
  const threads = await ctx.db
    .select({ ...getColumns(issueCommentThread) })
    .from(issueCommentThread)
    .where(
      and(
        eq(issueCommentThread.targetType, query.targetType),
        eq(issueCommentThread.targetId, query.targetId),
        query.isReviewThread !== undefined
          ? eq(issueCommentThread.isReviewThread, query.isReviewThread)
          : undefined,
      ),
    )
    .orderBy(asc(issueCommentThread.createdAt));

  if (threads.length === 0) return [];

  const threadIds = threads.map((t) => t.id);
  const comments = await ctx.db
    .select({ ...getColumns(issueComment) })
    .from(issueComment)
    .where(
      threadIds.length === 1
        ? eq(issueComment.threadId, threadIds[0])
        : inArray(issueComment.threadId, threadIds),
    )
    .orderBy(asc(issueComment.createdAt));

  const commentsByThread = new Map<
    number,
    (typeof issueComment.$inferSelect)[]
  >();
  for (const c of comments) {
    const list = commentsByThread.get(c.threadId) ?? [];
    list.push(c);
    commentsByThread.set(c.threadId, list);
  }

  return threads.map((t) => ({
    ...t,
    comments: commentsByThread.get(t.id) ?? [],
  }));
};
