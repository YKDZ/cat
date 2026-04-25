import { commentReaction } from "@cat/db";
import { assertSingleNonNullish } from "@cat/shared";
import * as z from "zod";

import type { Command } from "@/types";

import { domainEvent } from "@/events/domain-events";

export const UpsertCommentReactionCommandSchema = z.object({
  commentId: z.int(),
  userId: z.uuidv4(),
  type: z.custom<typeof commentReaction.$inferSelect.type>(),
});

export type UpsertCommentReactionCommand = z.infer<
  typeof UpsertCommentReactionCommandSchema
>;

export const upsertCommentReaction: Command<
  UpsertCommentReactionCommand,
  typeof commentReaction.$inferSelect
> = async (ctx, command) => {
  const inserted = assertSingleNonNullish(
    await ctx.db
      .insert(commentReaction)
      .values(command)
      .onConflictDoUpdate({
        target: [commentReaction.commentId, commentReaction.userId],
        set: { type: command.type },
      })
      .returning(),
  );

  return {
    result: inserted,
    events: [
      domainEvent("comment:updated", {
        commentId: command.commentId,
      }),
    ],
  };
};
