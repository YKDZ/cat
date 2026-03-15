import { and, comment, eq } from "@cat/db";
import * as z from "zod/v4";

import type { Command } from "@/types";

import { domainEvent } from "@/events/domain-events";

export const DeleteCommentCommandSchema = z.object({
  commentId: z.int(),
  userId: z.uuidv4(),
});

export type DeleteCommentCommand = z.infer<typeof DeleteCommentCommandSchema>;

export const deleteComment: Command<DeleteCommentCommand> = async (
  ctx,
  command,
) => {
  await ctx.db
    .delete(comment)
    .where(
      and(
        eq(comment.id, command.commentId),
        eq(comment.userId, command.userId),
      ),
    );

  return {
    result: undefined,
    events: [domainEvent("comment:deleted", { commentId: command.commentId })],
  };
};
