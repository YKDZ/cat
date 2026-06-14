import { eq, getColumns, qaReviewQueueItem, sql } from "@cat/db";
import { assertSingleNonNullish } from "@cat/shared";
import * as z from "zod";

import type { Command } from "@/types";

import { domainEvent } from "@/events/domain-events";

const ClaimQaReviewQueueItemCommandSchema = z.object({
  queueItemId: z.int().positive(),
  userId: z.uuidv4(),
});

export type ClaimQaReviewQueueItemCommand = z.infer<
  typeof ClaimQaReviewQueueItemCommandSchema
>;

/**
 * Mark a QA review queue item as claimed and record the claimant.
 */
export const claimQaReviewQueueItem: Command<
  ClaimQaReviewQueueItemCommand,
  typeof qaReviewQueueItem.$inferSelect
> = async (ctx, input) => {
  const cmd = ClaimQaReviewQueueItemCommandSchema.parse(input);
  const existing = assertSingleNonNullish(
    await ctx.db
      .select({ ...getColumns(qaReviewQueueItem) })
      .from(qaReviewQueueItem)
      .where(eq(qaReviewQueueItem.id, cmd.queueItemId))
      .limit(1),
  );
  const now = new Date();
  const updated = assertSingleNonNullish(
    await ctx.db
      .update(qaReviewQueueItem)
      .set({
        status: "CLAIMED",
        claimedBy: cmd.userId,
        claimedAt: now,
        lastActivityAt: now,
        optimisticVersion: sql`${qaReviewQueueItem.optimisticVersion} + 1`,
        updatedAt: now,
      })
      .where(eq(qaReviewQueueItem.id, cmd.queueItemId))
      .returning({ ...getColumns(qaReviewQueueItem) }),
  );

  return {
    result: updated,
    events: [
      domainEvent("qa-review:queue-updated", {
        projectId: updated.projectId,
        queueItemId: updated.id,
        status: updated.status,
        riskScore: updated.riskScore,
        previousStatus: existing.status,
      }),
    ],
  };
};
