import { eq, getColumns, pullRequest } from "@cat/db";
import { assertSingleNonNullish } from "@cat/shared";
import * as z from "zod";

import type { Command } from "@/types";

import { updateBranchStatus } from "@/commands/branch/update-branch-status.cmd.ts";
import { domainEvent } from "@/events/domain-events";

export const MergePRCommandSchema = z.object({
  prId: z.int().positive(),
  /** "user:<userId>" or "agent:<agentId>" */
  mergedBy: z.string().min(1),
});

export type MergePRCommand = z.infer<typeof MergePRCommandSchema>;

/**
 * @zh 合并 PR：设置 PR 状态为 MERGED，并将关联分支状态设为 MERGED。触发 pr:merged 事件。
 * @en Merge a PR: set PR status to MERGED and update associated branch to MERGED. Fires pr:merged event.
 */
export const mergePR: Command<
  MergePRCommand,
  typeof pullRequest.$inferSelect
> = async (ctx, command) => {
  const now = new Date();

  const current = assertSingleNonNullish(
    await ctx.db
      .select({ branchId: pullRequest.branchId, issueId: pullRequest.issueId })
      .from(pullRequest)
      .where(eq(pullRequest.id, command.prId))
      .limit(1),
  );

  await updateBranchStatus(ctx, {
    branchId: current.branchId,
    status: "MERGED",
    mergedAt: now,
  });

  const updated = assertSingleNonNullish(
    await ctx.db
      .update(pullRequest)
      .set({ status: "MERGED", mergedAt: now, mergedBy: command.mergedBy })
      .where(eq(pullRequest.id, command.prId))
      .returning({ ...getColumns(pullRequest) }),
  );

  return {
    result: updated,
    events: [
      domainEvent("pr:merged", {
        prId: command.prId,
        issueId: current.issueId ?? undefined,
        mergedBy: command.mergedBy,
      }),
    ],
  };
};
