import { eq, issueComment } from "@cat/db";
import * as z from "zod";

import type { Command } from "@/types";

export const DeleteIssueCommentCommandSchema = z.object({
  commentId: z.int().positive(),
});

export type DeleteIssueCommentCommand = z.infer<
  typeof DeleteIssueCommentCommandSchema
>;

export const deleteIssueComment: Command<DeleteIssueCommentCommand> = async (
  ctx,
  command,
) => {
  await ctx.db
    .delete(issueComment)
    .where(eq(issueComment.id, command.commentId));

  return { result: undefined, events: [] };
};
