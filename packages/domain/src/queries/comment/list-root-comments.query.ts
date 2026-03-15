import { and, comment, desc, eq, isNull } from "@cat/db";
import * as z from "zod/v4";

import type { Query } from "@/types";

export const ListRootCommentsQuerySchema = z.object({
  targetType: z.custom<typeof comment.$inferSelect.targetType>(),
  targetId: z.int(),
  pageIndex: z.int().min(0),
  pageSize: z.int().positive(),
});

export type ListRootCommentsQuery = z.infer<typeof ListRootCommentsQuerySchema>;

export const listRootComments: Query<
  ListRootCommentsQuery,
  Array<typeof comment.$inferSelect>
> = async (ctx, query) => {
  return ctx.db
    .select()
    .from(comment)
    .where(
      and(
        eq(comment.targetType, query.targetType),
        eq(comment.targetId, query.targetId),
        isNull(comment.parentCommentId),
      ),
    )
    .orderBy(desc(comment.createdAt))
    .offset(query.pageIndex * query.pageSize)
    .limit(query.pageSize);
};
