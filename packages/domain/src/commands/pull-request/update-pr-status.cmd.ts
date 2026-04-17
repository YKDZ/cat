import { eq, getColumns, pullRequest } from "@cat/db";
import { PullRequestStatusSchema } from "@cat/shared/schema/enum";
import { assertSingleNonNullish } from "@cat/shared/utils";
import * as z from "zod/v4";

import type { Command } from "@/types";

import { domainEvent } from "@/events/domain-events";

export const UpdatePRStatusCommandSchema = z.object({
  prId: z.int().positive(),
  status: PullRequestStatusSchema,
});

export type UpdatePRStatusCommand = z.infer<typeof UpdatePRStatusCommandSchema>;

/**
 * @zh 更新 PR 状态（DRAFT→OPEN→REVIEW→MERGED/CLOSED 等流转）。
 * @en Update PR status (state machine transitions: DRAFT→OPEN→REVIEW→MERGED/CLOSED etc.).
 */
export const updatePRStatus: Command<
  UpdatePRStatusCommand,
  typeof pullRequest.$inferSelect
> = async (ctx, command) => {
  const current = assertSingleNonNullish(
    await ctx.db
      .select({ status: pullRequest.status })
      .from(pullRequest)
      .where(eq(pullRequest.id, command.prId))
      .limit(1),
  );

  const updated = assertSingleNonNullish(
    await ctx.db
      .update(pullRequest)
      .set({ status: command.status })
      .where(eq(pullRequest.id, command.prId))
      .returning({ ...getColumns(pullRequest) }),
  );

  return {
    result: updated,
    events: [
      domainEvent("pr:status-changed", {
        prId: command.prId,
        oldStatus: current.status,
        newStatus: command.status,
      }),
    ],
  };
};
