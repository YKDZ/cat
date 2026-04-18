import { eq, getColumns, pullRequest } from "@cat/db";
import { assertSingleNonNullish } from "@cat/shared/utils";
import * as z from "zod";

import type { Command } from "@/types";

import { updateBranchStatus } from "@/commands/branch/update-branch-status.cmd.ts";
import { domainEvent } from "@/events/domain-events";

export const ClosePRCommandSchema = z.object({
  prId: z.int().positive(),
});

export type ClosePRCommand = z.infer<typeof ClosePRCommandSchema>;

/**
 * @zh 关闭 PR：设置 PR 状态为 CLOSED，并将关联分支状态设为 ABANDONED。
 * @en Close a PR: set PR status to CLOSED and update associated branch to ABANDONED.
 */
export const closePR: Command<
  ClosePRCommand,
  typeof pullRequest.$inferSelect
> = async (ctx, command) => {
  const current = assertSingleNonNullish(
    await ctx.db
      .select({ branchId: pullRequest.branchId })
      .from(pullRequest)
      .where(eq(pullRequest.id, command.prId))
      .limit(1),
  );

  await updateBranchStatus(ctx, {
    branchId: current.branchId,
    status: "ABANDONED",
  });

  const updated = assertSingleNonNullish(
    await ctx.db
      .update(pullRequest)
      .set({ status: "CLOSED" })
      .where(eq(pullRequest.id, command.prId))
      .returning({ ...getColumns(pullRequest) }),
  );

  return {
    result: updated,
    events: [domainEvent("pr:closed", { prId: command.prId })],
  };
};
