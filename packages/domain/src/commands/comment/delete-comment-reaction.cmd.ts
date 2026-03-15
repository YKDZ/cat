import { and, commentReaction, eq } from "@cat/db";
import * as z from "zod/v4";

import type { Command } from "@/types";

import { domainEvent } from "@/events/domain-events";

export const DeleteCommentReactionCommandSchema = z.object({
  commentId: z.int(),
  userId: z.uuidv4(),
});

export type DeleteCommentReactionCommand = z.infer<
  typeof DeleteCommentReactionCommandSchema
>;

export const deleteCommentReaction: Command<
  DeleteCommentReactionCommand
> = async (ctx, command) => {
  await ctx.db
    .delete(commentReaction)
    .where(
      and(
        eq(commentReaction.commentId, command.commentId),
        eq(commentReaction.userId, command.userId),
      ),
    );

  return {
    result: undefined,
    events: [
      domainEvent("comment:updated", {
        commentId: command.commentId,
      }),
    ],
  };
};
