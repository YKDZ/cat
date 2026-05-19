import type {
  QaFindingDisposition,
  QaReviewQueueStatus,
  QaReviewRiskBucket,
} from "@cat/shared";

import {
  and,
  eq,
  getColumns,
  notInArray,
  qaReviewFinding,
  qaReviewQueueItem,
  sql,
} from "@cat/db";
import { assertSingleNonNullish } from "@cat/shared";
import * as z from "zod";

import type { Command, DbHandle } from "@/types";

import { domainEvent } from "@/events/domain-events";

const MaterializeQaReviewQueueItemCommandSchema = z.object({
  projectId: z.uuidv4(),
  languageId: z.string().min(1),
  elementId: z.int().positive(),
  translationId: z.int().nullable().optional(),
  branchId: z.int().positive().nullable().optional(),
  pullRequestId: z.int().positive().nullable().optional(),
});

export type MaterializeQaReviewQueueItemCommand = z.infer<
  typeof MaterializeQaReviewQueueItemCommandSchema
>;

export type MaterializeQaReviewQueueItemResult = {
  queueItemId: number;
};

type TxCapableDb = DbHandle & {
  transaction?: <T>(fn: (tx: DbHandle) => Promise<T>) => Promise<T>;
};

const CLOSED_FINDING_DISPOSITIONS = [
  "FALSE_POSITIVE",
  "ACCEPTED",
  "SUPPRESSED",
  "SUPERSEDED",
] satisfies QaFindingDisposition[];

const riskBucketFromScore = (
  score: number,
  hasBlocking: boolean,
): QaReviewRiskBucket =>
  hasBlocking
    ? "BLOCKING"
    : score >= 80
      ? "HIGH"
      : score >= 50
        ? "MEDIUM"
        : score > 0
          ? "LOW"
          : "INFO";

const queueStatusFromFindings = (input: {
  hasBlocking: boolean;
  needsReview: boolean;
  hasOnlyInfoOrPass: boolean;
}): QaReviewQueueStatus => {
  if (input.hasBlocking) return "BLOCKED";
  if (input.needsReview) return "OPEN";
  if (input.hasOnlyInfoOrPass) return "APPROVABLE";
  return "OPEN";
};

const getFindingStats = async (
  db: DbHandle,
  input: MaterializeQaReviewQueueItemCommand,
) => {
  const translationValue = input.translationId ?? null;
  const rows = await db
    .select({
      action: qaReviewFinding.action,
      riskScore: qaReviewFinding.riskScore,
      createdAt: qaReviewFinding.createdAt,
    })
    .from(qaReviewFinding)
    .where(
      and(
        eq(qaReviewFinding.projectId, input.projectId),
        eq(qaReviewFinding.elementId, input.elementId),
        sql`${qaReviewFinding.translationId} IS NOT DISTINCT FROM ${translationValue}`,
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
  const lastFindingAt = rows.reduce<Date | null>(
    (latest, row) =>
      latest === null || row.createdAt > latest ? row.createdAt : latest,
    null,
  );

  return {
    hardFindingCount,
    softFindingCount,
    informationalFindingCount,
    riskScore,
    lastFindingAt,
    hasBlocking: hardFindingCount > 0,
    needsReview: softFindingCount > 0,
    hasOnlyInfoOrPass:
      rows.length === 0 ||
      rows.every(
        (row) => row.action === "INFORMATIONAL" || row.action === "PASS",
      ),
  };
};

const persistQueueItem = async (
  db: DbHandle,
  input: MaterializeQaReviewQueueItemCommand,
): Promise<{
  queueItemId: number;
  status: QaReviewQueueStatus;
  riskScore: number;
  previousStatus?: QaReviewQueueStatus;
}> => {
  const cmd = MaterializeQaReviewQueueItemCommandSchema.parse(input);
  const scopeKey = cmd.branchId ? `branch:${cmd.branchId}` : "main";
  const now = new Date();
  const stats = await getFindingStats(db, cmd);
  const computedStatus = queueStatusFromFindings(stats);
  const existing =
    (
      await db
        .select({ ...getColumns(qaReviewQueueItem) })
        .from(qaReviewQueueItem)
        .where(
          and(
            eq(qaReviewQueueItem.projectId, cmd.projectId),
            eq(qaReviewQueueItem.languageId, cmd.languageId),
            eq(qaReviewQueueItem.elementId, cmd.elementId),
            eq(qaReviewQueueItem.scopeKey, scopeKey),
            sql`${qaReviewQueueItem.translationId} IS NOT DISTINCT FROM ${cmd.translationId ?? null}`,
          ),
        )
        .limit(1)
    )[0] ?? null;

  if (cmd.translationId !== null && cmd.translationId !== undefined) {
    await db
      .update(qaReviewQueueItem)
      .set({
        status: "SUPERSEDED",
        supersededByTranslationId: cmd.translationId,
        resolvedAt: now,
        lastActivityAt: now,
        optimisticVersion: sql`${qaReviewQueueItem.optimisticVersion} + 1`,
        updatedAt: now,
      })
      .where(
        and(
          eq(qaReviewQueueItem.projectId, cmd.projectId),
          eq(qaReviewQueueItem.languageId, cmd.languageId),
          eq(qaReviewQueueItem.elementId, cmd.elementId),
          eq(qaReviewQueueItem.scopeKey, scopeKey),
          notInArray(qaReviewQueueItem.status, ["RESOLVED", "SUPERSEDED"]),
          sql`${qaReviewQueueItem.translationId} IS DISTINCT FROM ${cmd.translationId}`,
        ),
      );
  }

  const nextStatus =
    existing?.status === "CLAIMED" && computedStatus === "OPEN"
      ? "CLAIMED"
      : computedStatus;
  const riskBucket = riskBucketFromScore(stats.riskScore, stats.hasBlocking);

  if (existing) {
    const updated = assertSingleNonNullish(
      await db
        .update(qaReviewQueueItem)
        .set({
          branchId: cmd.branchId ?? null,
          pullRequestId: cmd.pullRequestId ?? null,
          status: nextStatus,
          riskBucket,
          riskScore: stats.riskScore,
          hardFindingCount: stats.hardFindingCount,
          softFindingCount: stats.softFindingCount,
          informationalFindingCount: stats.informationalFindingCount,
          lastFindingAt: stats.lastFindingAt,
          lastActivityAt: now,
          resolvedAt: nextStatus === "RESOLVED" ? now : null,
          supersededByTranslationId:
            nextStatus === "SUPERSEDED"
              ? (cmd.translationId ?? existing.supersededByTranslationId)
              : null,
          optimisticVersion: sql`${qaReviewQueueItem.optimisticVersion} + 1`,
          updatedAt: now,
        })
        .where(eq(qaReviewQueueItem.id, existing.id))
        .returning({
          id: qaReviewQueueItem.id,
          status: qaReviewQueueItem.status,
        }),
    );

    return {
      queueItemId: updated.id,
      status: updated.status,
      riskScore: stats.riskScore,
      previousStatus: existing.status,
    };
  }

  const inserted = assertSingleNonNullish(
    await db
      .insert(qaReviewQueueItem)
      .values({
        projectId: cmd.projectId,
        languageId: cmd.languageId,
        elementId: cmd.elementId,
        translationId: cmd.translationId ?? null,
        branchId: cmd.branchId ?? null,
        pullRequestId: cmd.pullRequestId ?? null,
        scopeKey,
        status: nextStatus,
        riskBucket,
        riskScore: stats.riskScore,
        hardFindingCount: stats.hardFindingCount,
        softFindingCount: stats.softFindingCount,
        informationalFindingCount: stats.informationalFindingCount,
        unresolvedAnnotationCount: 0,
        annotationCount: 0,
        lastFindingAt: stats.lastFindingAt,
        lastActivityAt: now,
        resolvedAt: nextStatus === "RESOLVED" ? now : null,
      })
      .returning({
        id: qaReviewQueueItem.id,
        status: qaReviewQueueItem.status,
      }),
  );

  return {
    queueItemId: inserted.id,
    status: inserted.status,
    riskScore: stats.riskScore,
  };
};

/**
 * @zh 根据当前 translation 的未关闭 findings 物化或更新审校队列项。
 * @en Materialize or update a QA review queue item from the current translation findings.
 */
export const materializeQaReviewQueueItem: Command<
  MaterializeQaReviewQueueItemCommand,
  MaterializeQaReviewQueueItemResult
> = async (ctx, input) => {
  const txCandidate = ctx.db as TxCapableDb;
  const cmd = MaterializeQaReviewQueueItemCommandSchema.parse(input);
  const persisted =
    typeof txCandidate.transaction === "function"
      ? await txCandidate.transaction(
          async (tx) => await persistQueueItem(tx, cmd),
        )
      : await persistQueueItem(ctx.db, cmd);

  return {
    result: { queueItemId: persisted.queueItemId },
    events: [
      domainEvent("qa-review:queue-updated", {
        projectId: cmd.projectId,
        queueItemId: persisted.queueItemId,
        status: persisted.status,
        riskScore: persisted.riskScore,
        previousStatus: persisted.previousStatus,
      }),
    ],
  };
};
