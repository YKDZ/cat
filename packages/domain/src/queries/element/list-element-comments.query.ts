import * as z from "zod";

import type { Query } from "@/types";

import { listChildComments } from "@/queries/comment/list-child-comments.query";
import { listRootComments } from "@/queries/comment/list-root-comments.query";

export const ListElementCommentsQuerySchema = z.object({
  elementId: z.int(),
  maxCount: z.int().min(0).default(5),
});

export type ListElementCommentsQuery = z.infer<
  typeof ListElementCommentsQuerySchema
>;

export type CommentThread = {
  id: number;
  authorId: string;
  content: string;
  createdAt: Date;
  children: Array<{
    id: number;
    authorId: string;
    content: string;
    createdAt: Date;
  }>;
};

/**
 * @zh 查询元素上的评论及其回复，按最新优先排序。
 * @en Query comments on an element with their replies, ordered by most recent.
 */
export const listElementComments: Query<
  ListElementCommentsQuery,
  CommentThread[]
> = async (ctx, query) => {
  if (query.maxCount <= 0) return [];

  const rootComments = await listRootComments(ctx, {
    targetType: "ELEMENT" as const,
    targetId: query.elementId,
    pageIndex: 0,
    pageSize: query.maxCount,
  });

  const threads: CommentThread[] = await Promise.all(
    rootComments.map(async (root) => {
      const childRows = await listChildComments(ctx, {
        rootCommentId: root.id,
      });

      return {
        id: root.id,
        authorId: root.userId,
        content: root.content,
        createdAt: root.createdAt,
        children: childRows.map((child) => ({
          id: child.id,
          authorId: child.userId,
          content: child.content,
          createdAt: child.createdAt,
        })),
      };
    }),
  );

  return threads;
};
