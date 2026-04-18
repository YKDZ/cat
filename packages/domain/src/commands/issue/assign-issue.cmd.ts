import { eq, getColumns, issue } from "@cat/db";
import { assertSingleNonNullish } from "@cat/shared/utils";
import * as z from "zod";

import type { Command } from "@/types";

import { domainEvent } from "@/events/domain-events";

export const AssignIssueCommandSchema = z.object({
  issueId: z.int().positive(),
  assignees: z.array(
    z.object({ type: z.enum(["user", "agent"]), id: z.string() }),
  ),
});

export type AssignIssueCommand = z.infer<typeof AssignIssueCommandSchema>;

export const assignIssue: Command<
  AssignIssueCommand,
  typeof issue.$inferSelect
> = async (ctx, command) => {
  const updated = assertSingleNonNullish(
    await ctx.db
      .update(issue)
      .set({ assignees: command.assignees })
      .where(eq(issue.id, command.issueId))
      .returning({ ...getColumns(issue) }),
  );

  return {
    result: updated,
    events: [
      domainEvent("issue:assigned", {
        issueId: command.issueId,
        assignees: command.assignees,
      }),
    ],
  };
};
