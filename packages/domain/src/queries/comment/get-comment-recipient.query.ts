import { comment, eq, translation } from "@cat/db";
import * as z from "zod/v4";

import type { Query } from "@/types";

export const GetCommentRecipientQuerySchema = z.object({
  commentId: z.int(),
});
export type GetCommentRecipientQuery = z.infer<
  typeof GetCommentRecipientQuerySchema
>;

/**
 * @zh 解析评论通知的接收人：若为回复则通知被回复人，否则通知翻译作者。与评论作者相同时返回 null。
 * @en Resolve the notification recipient for a comment: reply author or translation author. Returns null when same as commenter.
 */
export const getCommentRecipient: Query<
  GetCommentRecipientQuery,
  { recipientId: string; commenterId: string } | null
> = async (ctx, query) => {
  const row = await ctx.db
    .select()
    .from(comment)
    .where(eq(comment.id, query.commentId))
    .limit(1)
    .then((r: (typeof comment.$inferSelect)[]) => r[0]);
  if (!row) return null;

  let recipientId: string | null = null;

  if (row.parentCommentId) {
    const parent = await ctx.db
      .select({ userId: comment.userId })
      .from(comment)
      .where(eq(comment.id, row.parentCommentId))
      .limit(1)
      .then((r: { userId: string }[]) => r[0]);
    recipientId = parent?.userId ?? null;
  } else if (row.targetType === "TRANSLATION") {
    const tr = await ctx.db
      .select({ translatorId: translation.translatorId })
      .from(translation)
      .where(eq(translation.id, row.targetId))
      .limit(1)
      .then((r: { translatorId: string | null }[]) => r[0]);
    recipientId = tr?.translatorId ?? null;
  }

  if (!recipientId || recipientId === row.userId) return null;
  return { recipientId, commenterId: row.userId };
};
