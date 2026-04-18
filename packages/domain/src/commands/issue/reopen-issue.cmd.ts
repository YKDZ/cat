import { eq, getColumns, issue } from "@cat/db";
import { assertSingleNonNullish } from "@cat/shared/utils";
import * as z from "zod";

import type { Command } from "@/types";

import { domainEvent } from "@/events/domain-events";

export const ReopenIssueCommandSchema = z.object({
  issueId: z.int().positive(),
});

export type ReopenIssueCommand = z.infer<typeof ReopenIssueCommandSchema>;

export const reopenIssue: Command<
  ReopenIssueCommand,
  typeof issue.$inferSelect
> = async (ctx, command) => {
  const updated = assertSingleNonNullish(
    await ctx.db
      .update(issue)
      .set({
        status: "OPEN",
        closedAt: null,
        closedByPRId: null,
      })
      .where(eq(issue.id, command.issueId))
      .returning({ ...getColumns(issue) }),
  );

  return {
    result: updated,
    events: [domainEvent("issue:reopened", { issueId: command.issueId })],
  };
};
