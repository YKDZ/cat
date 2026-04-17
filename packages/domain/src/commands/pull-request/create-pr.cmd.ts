import { getColumns, pullRequest } from "@cat/db";
import { safeZDotJson } from "@cat/shared/schema/json";
import { assertSingleNonNullish } from "@cat/shared/utils";
import * as z from "zod/v4";

import type { Command } from "@/types";

import { createBranch } from "@/commands/branch/create-branch.cmd.ts";
import { allocateNumber } from "@/commands/sequence/allocate-number.cmd.ts";
import { domainEvent } from "@/events/domain-events";

export const CreatePRCommandSchema = z.object({
  projectId: z.uuid(),
  title: z.string().min(1),
  body: z.string().default(""),
  authorId: z.uuid().optional(),
  authorAgentId: z.int().positive().optional(),
  reviewers: z
    .array(z.object({ type: z.enum(["user", "agent"]), id: z.string() }))
    .default([]),
  issueId: z.int().positive().optional(),
  metadata: safeZDotJson.optional(),
});

export type CreatePRCommand = z.infer<typeof CreatePRCommandSchema>;

/**
 * @zh 创建 PR：分配序号、创建关联分支，并插入 PR 记录。
 * @en Create a PR: allocate number, create associated branch, and insert the PR record.
 */
export const createPR: Command<
  CreatePRCommand,
  typeof pullRequest.$inferSelect
> = async (ctx, command) => {
  const { result: number } = await allocateNumber(ctx, {
    projectId: command.projectId,
  });

  const branchName = `pr/${number}`;
  const { result: branch } = await createBranch(ctx, {
    projectId: command.projectId,
    name: branchName,
    createdBy: command.authorId,
    createdByAgentId: command.authorAgentId,
  });

  const inserted = assertSingleNonNullish(
    await ctx.db
      .insert(pullRequest)
      .values({
        projectId: command.projectId,
        number,
        title: command.title,
        body: command.body,
        status: "DRAFT",
        authorId: command.authorId ?? null,
        authorAgentId: command.authorAgentId ?? null,
        branchId: branch.id,
        issueId: command.issueId ?? null,
        reviewers: command.reviewers,
        metadata: command.metadata ?? null,
      })
      .returning({ ...getColumns(pullRequest) }),
  );

  return {
    result: inserted,
    events: [
      domainEvent("pr:created", {
        projectId: command.projectId,
        prId: inserted.id,
        number,
        issueId: command.issueId,
      }),
    ],
  };
};
