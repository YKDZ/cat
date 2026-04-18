import { eq, getColumns, issueComment, sql } from "@cat/db";
import { assertSingleNonNullish } from "@cat/shared/utils";
import * as z from "zod";

import type { Command } from "@/types";

export const UpdateIssueCommentCommandSchema = z.object({
  commentId: z.int().positive(),
  body: z.string().min(1),
});

export type UpdateIssueCommentCommand = z.infer<
  typeof UpdateIssueCommentCommandSchema
>;

export const updateIssueComment: Command<
  UpdateIssueCommentCommand,
  typeof issueComment.$inferSelect
> = async (ctx, command) => {
  const updated = assertSingleNonNullish(
    await ctx.db
      .update(issueComment)
      .set({ body: command.body, editedAt: sql`NOW()` })
      .where(eq(issueComment.id, command.commentId))
      .returning({ ...getColumns(issueComment) }),
  );

  return { result: updated, events: [] };
};
