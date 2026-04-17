import { eq, getColumns, pullRequest } from "@cat/db";
import { assertSingleNonNullish } from "@cat/shared/utils";
import * as z from "zod/v4";

import type { Command } from "@/types";

import { domainEvent } from "@/events/domain-events";

/** Review decision: APPROVE or CHANGES_REQUESTED */
export const ReviewDecisionSchema = z.enum(["APPROVE", "CHANGES_REQUESTED"]);
export type ReviewDecision = z.infer<typeof ReviewDecisionSchema>;

export const SubmitReviewCommandSchema = z.object({
  prId: z.int().positive(),
  reviewerId: z.string().min(1),
  decision: ReviewDecisionSchema,
});

export type SubmitReviewCommand = z.infer<typeof SubmitReviewCommandSchema>;

/**
 * @zh 提交 PR Review：APPROVE 时 PR 保持 REVIEW 状态（或移回 OPEN），CHANGES_REQUESTED 时设为 CHANGES_REQUESTED。
 * @en Submit a PR review: APPROVE keeps the PR in REVIEW (or moves back to OPEN if CHANGES_REQUESTED),
 * CHANGES_REQUESTED sets PR status to CHANGES_REQUESTED.
 */
export const submitReview: Command<
  SubmitReviewCommand,
  typeof pullRequest.$inferSelect
> = async (ctx, command) => {
  let newStatus: "REVIEW" | "CHANGES_REQUESTED" | undefined;

  if (command.decision === "CHANGES_REQUESTED") {
    newStatus = "CHANGES_REQUESTED";
  } else {
    // APPROVE: if currently CHANGES_REQUESTED, move back to REVIEW
    const current = await ctx.db
      .select({ status: pullRequest.status })
      .from(pullRequest)
      .where(eq(pullRequest.id, command.prId))
      .limit(1);
    if (current[0]?.status === "CHANGES_REQUESTED") {
      newStatus = "REVIEW";
    }
  }

  const updated = assertSingleNonNullish(
    await ctx.db
      .update(pullRequest)
      .set(newStatus ? { status: newStatus } : {})
      .where(eq(pullRequest.id, command.prId))
      .returning({ ...getColumns(pullRequest) }),
  );

  return {
    result: updated,
    events: [
      domainEvent("pr:review-submitted", {
        prId: command.prId,
        reviewerId: command.reviewerId,
        decision: command.decision,
      }),
    ],
  };
};
