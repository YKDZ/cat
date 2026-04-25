import { comment } from "@cat/db";
import { assertSingleNonNullish } from "@cat/shared";
import * as z from "zod";

import type { Command } from "@/types";

import { domainEvent } from "@/events/domain-events";

export const CreateCommentCommandSchema = z.object({
  targetType: z.custom<typeof comment.$inferSelect.targetType>(),
  targetId: z.int(),
  userId: z.uuidv4(),
  content: z.string(),
  languageId: z.string(),
  parentCommentId: z.int().optional(),
});

export type CreateCommentCommand = z.infer<typeof CreateCommentCommandSchema>;

export const createComment: Command<
  CreateCommentCommand,
  typeof comment.$inferSelect
> = async (ctx, command) => {
  const inserted = assertSingleNonNullish(
    await ctx.db.insert(comment).values(command).returning(),
  );

  return {
    result: inserted,
    events: [
      domainEvent("comment:created", {
        commentId: inserted.id,
      }),
    ],
  };
};
