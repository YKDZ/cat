import { getColumns, issueComment } from "@cat/db";
import { assertSingleNonNullish } from "@cat/shared/utils";
import * as z from "zod";

import type { Command } from "@/types";

import { domainEvent } from "@/events/domain-events";

export const CreateIssueCommentCommandSchema = z.object({
  threadId: z.int().positive(),
  body: z.string().min(1),
  authorId: z.uuid().optional(),
  authorAgentId: z.int().positive().optional(),
  /** targetType and targetId carried for the domain event payload */
  targetType: z.enum(["issue", "pr"]),
  targetId: z.int().positive(),
});

export type CreateIssueCommentCommand = z.infer<
  typeof CreateIssueCommentCommandSchema
>;

export const createIssueComment: Command<
  CreateIssueCommentCommand,
  typeof issueComment.$inferSelect
> = async (ctx, command) => {
  const inserted = assertSingleNonNullish(
    await ctx.db
      .insert(issueComment)
      .values({
        threadId: command.threadId,
        body: command.body,
        authorId: command.authorId ?? null,
        authorAgentId: command.authorAgentId ?? null,
      })
      .returning({ ...getColumns(issueComment) }),
  );

  return {
    result: inserted,
    events: [
      domainEvent("issue-comment:created", {
        threadId: command.threadId,
        commentId: inserted.id,
        targetType: command.targetType,
        targetId: command.targetId,
      }),
    ],
  };
};
