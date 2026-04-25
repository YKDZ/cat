import { eq, getColumns, issue } from "@cat/db";
import { assertSingleNonNullish } from "@cat/shared";
import * as z from "zod";

import type { Command } from "@/types";

import { domainEvent } from "@/events/domain-events";

export const CloseIssueCommandSchema = z.object({
  issueId: z.int().positive(),
  closedByPRId: z.int().positive().optional(),
});

export type CloseIssueCommand = z.infer<typeof CloseIssueCommandSchema>;

export const closeIssue: Command<
  CloseIssueCommand,
  typeof issue.$inferSelect
> = async (ctx, command) => {
  const updated = assertSingleNonNullish(
    await ctx.db
      .update(issue)
      .set({
        status: "CLOSED",
        closedAt: new Date(),
        closedByPRId: command.closedByPRId ?? null,
      })
      .where(eq(issue.id, command.issueId))
      .returning({ ...getColumns(issue) }),
  );

  return {
    result: updated,
    events: [
      domainEvent("issue:closed", {
        issueId: command.issueId,
        closedByPRId: command.closedByPRId,
      }),
    ],
  };
};
