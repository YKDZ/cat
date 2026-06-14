import {
  and,
  eq,
  getColumns,
  notInArray,
  qaReviewDecision,
  qaReviewFinding,
  qaReviewQueueItem,
  sql,
} from "@cat/db";
import {
  type QaFindingDisposition,
  SubmitQaReviewDecisionInputSchema,
  assertSingleNonNullish,
} from "@cat/shared";
import * as z from "zod";

import type { Command } from "@/types";

import { domainEvent } from "@/events/domain-events";

const CLOSED_FINDING_DISPOSITIONS = [
  "FALSE_POSITIVE",
  "ACCEPTED",
  "SUPPRESSED",
  "SUPERSEDED",
] satisfies QaFindingDisposition[];

const SubmitQaReviewDecisionCommandInputSchema =
  SubmitQaReviewDecisionInputSchema.extend({
    reviewerId: z.uuidv4(),
  }).superRefine((input, ctx) => {
    if (input.decision === "CLOSE_FINDING") {
      if (input.findingId === undefined) {
        ctx.addIssue({
          code: "custom",
          message: "findingId is required when closing a finding",
          path: ["findingId"],
        });
      }
      if (input.findingDisposition === undefined) {
        ctx.addIssue({
          code: "custom",
          message: "findingDisposition is required when closing a finding",
          path: ["findingDisposition"],
        });
      }
    }
  });

export type SubmitQaReviewDecisionCommandInput = z.infer<
  typeof SubmitQaReviewDecisionCommandInputSchema
>;

export class QaReviewConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "QaReviewConflictError";
  }
}

export class QaReviewBlockingOverrideRequiredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "QaReviewBlockingOverrideRequiredError";
  }
}

const queueStatusFromStats = (input: {
  hasBlocking: boolean;
  needsReview: boolean;
  hasOnlyInfoOrPass: boolean;
}) => {
  if (input.hasBlocking) return "BLOCKED" as const;
  if (input.needsReview) return "OPEN" as const;
  if (input.hasOnlyInfoOrPass) return "APPROVABLE" as const;
  return "OPEN" as const;
};

const getQueueFindingStats = async (
  ctx: Parameters<Command<unknown>>[0],
  queueItem: typeof qaReviewQueueItem.$inferSelect,
) => {
  const rows = await ctx.db
    .select({
      action: qaReviewFinding.action,
      riskScore: qaReviewFinding.riskScore,
    })
    .from(qaReviewFinding)
    .where(
      and(
        eq(qaReviewFinding.projectId, queueItem.projectId),
        eq(qaReviewFinding.elementId, queueItem.elementId),
        sql`${qaReviewFinding.translationId} IS NOT DISTINCT FROM ${queueItem.translationId}`,
        notInArray(qaReviewFinding.disposition, CLOSED_FINDING_DISPOSITIONS),
      ),
    );

  const hardFindingCount = rows.filter(
    (row) => row.action === "BLOCK_APPROVAL",
  ).length;
  const softFindingCount = rows.filter(
    (row) => row.action === "NEEDS_REVIEW",
  ).length;
  const informationalFindingCount = rows.filter(
    (row) => row.action === "INFORMATIONAL",
  ).length;
  const riskScore = Math.max(0, ...rows.map((row) => row.riskScore));

  return {
    hardFindingCount,
    softFindingCount,
    informationalFindingCount,
    riskScore,
    status: queueStatusFromStats({
      hasBlocking: hardFindingCount > 0,
      needsReview: softFindingCount > 0,
      hasOnlyInfoOrPass:
        rows.length === 0 ||
        rows.every(
          (row) => row.action === "INFORMATIONAL" || row.action === "PASS",
        ),
    }),
  };
};

/**
 * Submit a QA review decision and perform finding closure plus optimistic concurrency checks when needed.
 */
export const submitQaReviewDecision: Command<
  SubmitQaReviewDecisionCommandInput,
  typeof qaReviewDecision.$inferSelect
> = async (ctx, input) => {
  const cmd = SubmitQaReviewDecisionCommandInputSchema.parse(input);
  const queueItem = assertSingleNonNullish(
    await ctx.db
      .select({ ...getColumns(qaReviewQueueItem) })
      .from(qaReviewQueueItem)
      .where(eq(qaReviewQueueItem.id, cmd.queueItemId))
      .limit(1),
  );

  if (queueItem.optimisticVersion !== cmd.expectedVersion) {
    throw new QaReviewConflictError(
      "QA review state changed. Refresh and try again.",
    );
  }

  let nextQueueStatus = queueItem.status;
  let nextRiskScore = queueItem.riskScore;
  let nextHardFindingCount = queueItem.hardFindingCount;
  let nextSoftFindingCount = queueItem.softFindingCount;
  let nextInformationalFindingCount = queueItem.informationalFindingCount;

  if (cmd.decision === "APPROVE") {
    const blockers = await ctx.db
      .select({ id: qaReviewFinding.id })
      .from(qaReviewFinding)
      .where(
        and(
          eq(qaReviewFinding.projectId, queueItem.projectId),
          eq(qaReviewFinding.elementId, queueItem.elementId),
          sql`${qaReviewFinding.translationId} IS NOT DISTINCT FROM ${queueItem.translationId}`,
          eq(qaReviewFinding.action, "BLOCK_APPROVAL"),
          notInArray(qaReviewFinding.disposition, CLOSED_FINDING_DISPOSITIONS),
        ),
      )
      .limit(1);

    if (blockers.length > 0 && !cmd.overrideBlocking) {
      throw new QaReviewBlockingOverrideRequiredError(
        "Blocking QA findings require explicit override before approval.",
      );
    }
    nextQueueStatus = "RESOLVED";
  } else if (cmd.decision === "REQUEST_CHANGES") {
    nextQueueStatus = "REQUEST_CHANGES";
  } else if (cmd.decision === "REJECT_CANDIDATE") {
    nextQueueStatus = "RESOLVED";
  } else if (cmd.decision === "CLOSE_FINDING") {
    await ctx.db
      .update(qaReviewFinding)
      .set({
        disposition: cmd.findingDisposition!,
        reviewedBy: cmd.reviewerId,
        reviewedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(qaReviewFinding.id, cmd.findingId!));

    const stats = await getQueueFindingStats(ctx, queueItem);
    nextHardFindingCount = stats.hardFindingCount;
    nextSoftFindingCount = stats.softFindingCount;
    nextInformationalFindingCount = stats.informationalFindingCount;
    nextRiskScore = stats.riskScore;
    nextQueueStatus =
      queueItem.status === "CLAIMED" && stats.status === "OPEN"
        ? "CLAIMED"
        : stats.status;
  } else if (cmd.decision === "PRAISE") {
    nextQueueStatus =
      queueItem.status === "OPEN" || queueItem.status === "CLAIMED"
        ? "APPROVABLE"
        : queueItem.status;
  } else if (cmd.decision === "DEFER") {
    nextQueueStatus =
      queueItem.status === "OPEN" || queueItem.status === "CLAIMED"
        ? queueItem.status
        : "OPEN";
  }

  const inserted = assertSingleNonNullish(
    await ctx.db
      .insert(qaReviewDecision)
      .values({
        queueItemId: queueItem.id,
        projectId: queueItem.projectId,
        elementId: queueItem.elementId,
        translationId: queueItem.translationId,
        findingId: cmd.findingId ?? null,
        annotationId: cmd.annotationId ?? null,
        branchId: queueItem.branchId,
        pullRequestId: queueItem.pullRequestId,
        decision: cmd.decision,
        reviewerId: cmd.reviewerId,
        reason: cmd.reason,
        expectedVersion: cmd.expectedVersion,
      })
      .returning({ ...getColumns(qaReviewDecision) }),
  );

  await ctx.db
    .update(qaReviewQueueItem)
    .set({
      status: nextQueueStatus,
      riskScore: nextRiskScore,
      hardFindingCount: nextHardFindingCount,
      softFindingCount: nextSoftFindingCount,
      informationalFindingCount: nextInformationalFindingCount,
      resolvedAt: nextQueueStatus === "RESOLVED" ? new Date() : null,
      lastActivityAt: new Date(),
      optimisticVersion: sql`${qaReviewQueueItem.optimisticVersion} + 1`,
      updatedAt: new Date(),
    })
    .where(eq(qaReviewQueueItem.id, queueItem.id));

  return {
    result: inserted,
    events: [
      domainEvent("qa-review:decision-submitted", {
        projectId: queueItem.projectId,
        queueItemId: queueItem.id,
        decisionId: inserted.id,
        decision: inserted.decision,
        reviewerId: inserted.reviewerId ?? undefined,
      }),
    ],
  };
};
