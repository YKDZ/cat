import { getColumns, issue, issueLabel } from "@cat/db";
import { safeZDotJson } from "@cat/shared/schema/json";
import { assertSingleNonNullish } from "@cat/shared/utils";
import * as z from "zod/v4";

import type { Command } from "@/types";

import { allocateNumber } from "@/commands/sequence/allocate-number.cmd.ts";
import { domainEvent } from "@/events/domain-events";

export const CreateIssueCommandSchema = z.object({
  projectId: z.uuid(),
  title: z.string().min(1),
  body: z.string().default(""),
  authorId: z.uuid().optional(),
  authorAgentId: z.int().optional(),
  assignees: z
    .array(z.object({ type: z.enum(["user", "agent"]), id: z.string() }))
    .default([]),
  labels: z.array(z.string()).default([]),
  claimPolicy: z
    .object({
      rules: z.array(
        z.object({ type: z.enum(["agent", "role", "user"]), id: z.string() }),
      ),
    })
    .nullable()
    .optional(),
  parentIssueId: z.int().optional(),
  metadata: safeZDotJson.optional(),
});

export type CreateIssueCommand = z.infer<typeof CreateIssueCommandSchema>;

export const createIssue: Command<
  CreateIssueCommand,
  typeof issue.$inferSelect
> = async (ctx, command) => {
  const { result: number } = await allocateNumber(ctx, {
    projectId: command.projectId,
  });

  const inserted = assertSingleNonNullish(
    await ctx.db
      .insert(issue)
      .values({
        projectId: command.projectId,
        number,
        title: command.title,
        body: command.body,
        authorId: command.authorId,
        authorAgentId: command.authorAgentId,
        assignees: command.assignees,
        claimPolicy: command.claimPolicy ?? null,
        parentIssueId: command.parentIssueId,
        metadata: command.metadata ?? null,
      })
      .returning({ ...getColumns(issue) }),
  );

  if (command.labels.length > 0) {
    await ctx.db
      .insert(issueLabel)
      .values(command.labels.map((label) => ({ issueId: inserted.id, label })));
  }

  return {
    result: inserted,
    events: [
      domainEvent("issue:created", {
        projectId: command.projectId,
        issueId: inserted.id,
        number,
      }),
    ],
  };
};
