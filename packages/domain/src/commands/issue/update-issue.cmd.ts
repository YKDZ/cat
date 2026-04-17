import { eq, getColumns, issue, issueLabel } from "@cat/db";
import { safeZDotJson } from "@cat/shared/schema/json";
import { assertSingleNonNullish } from "@cat/shared/utils";
import * as z from "zod/v4";

import type { Command } from "@/types";

import { domainEvent } from "@/events/domain-events";

export const UpdateIssueCommandSchema = z.object({
  issueId: z.int().positive(),
  title: z.string().min(1).optional(),
  body: z.string().optional(),
  labels: z.array(z.string()).optional(),
  metadata: safeZDotJson.optional(),
});

export type UpdateIssueCommand = z.infer<typeof UpdateIssueCommandSchema>;

export const updateIssue: Command<
  UpdateIssueCommand,
  typeof issue.$inferSelect
> = async (ctx, command) => {
  const updates: Partial<typeof issue.$inferInsert> = {};
  if (command.title !== undefined) updates.title = command.title;
  if (command.body !== undefined) updates.body = command.body;
  if (command.metadata !== undefined) updates.metadata = command.metadata;

  const updated = assertSingleNonNullish(
    await ctx.db
      .update(issue)
      .set(updates)
      .where(eq(issue.id, command.issueId))
      .returning({ ...getColumns(issue) }),
  );

  if (command.labels !== undefined) {
    await ctx.db
      .delete(issueLabel)
      .where(eq(issueLabel.issueId, command.issueId));
    if (command.labels.length > 0) {
      await ctx.db
        .insert(issueLabel)
        .values(
          command.labels.map((label) => ({ issueId: command.issueId, label })),
        );
    }
  }

  return {
    result: updated,
    events: [domainEvent("issue:updated", { issueId: command.issueId })],
  };
};
