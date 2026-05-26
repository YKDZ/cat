import {
  and,
  eq,
  getColumns,
  notInArray,
  qaReviewAnnotation,
  qaReviewDecision,
  qaReviewFinding,
  qaReviewQueueItem,
  sql,
  translatableElement,
} from "@cat/db";
import {
  SubmitQaReviewActionInputSchema,
  assertSingleNonNullish,
  type QaFindingDisposition,
} from "@cat/shared";
import * as z from "zod";

import type { Command, DbHandle } from "@/types";

import { domainEvent } from "@/events/domain-events";

import {
  QaReviewBlockingOverrideRequiredError,
  QaReviewConflictError,
} from "./submit-decision.cmd.ts";

const SubmitQaReviewActionCommandSchema =
  SubmitQaReviewActionInputSchema.extend({ reviewerId: z.uuidv4() });

type TxCapableDb = DbHandle & {
  transaction?: <T>(fn: (tx: DbHandle) => Promise<T>) => Promise<T>;
};

const CLOSED_FINDING_DISPOSITIONS = [
  "FALSE_POSITIVE",
  "ACCEPTED",
  "SUPPRESSED",
  "SUPERSEDED",
] satisfies QaFindingDisposition[];

export type BranchApprovalOverlayMutation = {
  translationId: number;
  approved: boolean;
};

export type SubmitQaReviewActionCommandResult = {
  decisionId: number;
  annotationId: number | null;
  queueItemId: number;
  queueStatus: typeof qaReviewQueueItem.$inferSelect.status;
  approvedTranslationId: number | null;
  affectedSiblingQueueItemIds: number[];
  branchApprovalOverlayMutations: BranchApprovalOverlayMutation[];
};

const runSubmitQaReviewAction = async (
  db: DbHandle,
  cmd: z.infer<typeof SubmitQaReviewActionCommandSchema>,
): Promise<SubmitQaReviewActionCommandResult> => {
  const queueItem = assertSingleNonNullish(
    await db
      .select({ ...getColumns(qaReviewQueueItem) })
      .from(qaReviewQueueItem)
      .where(eq(qaReviewQueueItem.id, cmd.queueItemId))
      .limit(1),
  );

  const expectedScopeKey = cmd.branchId ? `branch:${cmd.branchId}` : "main";

  if (
    queueItem.projectId !== cmd.projectId ||
    queueItem.elementId !== cmd.elementId ||
    queueItem.languageId !== cmd.languageId ||
    queueItem.translationId !== cmd.translationId ||
    queueItem.scopeKey !== expectedScopeKey
  ) {
    throw new QaReviewConflictError(
      "Selected QA candidate no longer matches the submitted review action.",
    );
  }

  if (queueItem.optimisticVersion !== cmd.expectedVersion) {
    throw new QaReviewConflictError(
      "QA review state changed. Refresh and try again.",
    );
  }

  if (queueItem.status === "RESOLVED" || queueItem.status === "SUPERSEDED") {
    throw new QaReviewConflictError("QA review candidate is already closed.");
  }

  const blockers = await db
    .select({ id: qaReviewFinding.id })
    .from(qaReviewFinding)
    .where(
      and(
        eq(qaReviewFinding.projectId, cmd.projectId),
        eq(qaReviewFinding.elementId, cmd.elementId),
        sql`${qaReviewFinding.translationId} IS NOT DISTINCT FROM ${cmd.translationId}`,
        eq(qaReviewFinding.action, "BLOCK_APPROVAL"),
        notInArray(qaReviewFinding.disposition, CLOSED_FINDING_DISPOSITIONS),
      ),
    );

  if (
    cmd.action === "APPROVE" &&
    blockers.length > 0 &&
    !cmd.overrideBlocking
  ) {
    throw new QaReviewBlockingOverrideRequiredError(
      "Blocking QA findings require explicit override before approval.",
    );
  }

  const now = new Date();
  const noteBody = cmd.noteBody?.trim() ?? "";
  const annotation =
    noteBody.length === 0
      ? null
      : assertSingleNonNullish(
          await db
            .insert(qaReviewAnnotation)
            .values({
              queueItemId: queueItem.id,
              projectId: queueItem.projectId,
              elementId: queueItem.elementId,
              translationId: queueItem.translationId,
              branchId: queueItem.branchId,
              pullRequestId: queueItem.pullRequestId,
              findingId: null,
              intent: "NOTE",
              status: "OPEN",
              body: noteBody,
              authorId: cmd.reviewerId,
              isPromotable: false,
            })
            .returning({ id: qaReviewAnnotation.id }),
        );

  const decisionReason =
    noteBody.length > 0
      ? noteBody
      : cmd.action === "APPROVE" && cmd.overrideBlocking
        ? (cmd.overrideReason ?? "")
        : cmd.action === "APPROVE"
          ? "Approved selected QA candidate"
          : cmd.action === "REJECT_CANDIDATE"
            ? "Rejected selected QA candidate"
            : "Deferred selected QA candidate";

  const decision = assertSingleNonNullish(
    await db
      .insert(qaReviewDecision)
      .values({
        queueItemId: queueItem.id,
        projectId: queueItem.projectId,
        elementId: queueItem.elementId,
        translationId: queueItem.translationId,
        annotationId: annotation?.id ?? null,
        branchId: queueItem.branchId,
        pullRequestId: queueItem.pullRequestId,
        decision: cmd.action,
        reviewerId: cmd.reviewerId,
        reason: decisionReason,
        expectedVersion: cmd.expectedVersion,
      })
      .returning({ id: qaReviewDecision.id }),
  );

  let approvedTranslationId: number | null = null;
  let affectedSiblingQueueItemIds: number[] = [];
  let branchApprovalOverlayMutations: BranchApprovalOverlayMutation[] = [];

  if (cmd.action === "APPROVE") {
    if (cmd.branchId === null || cmd.branchId === undefined) {
      await db
        .update(translatableElement)
        .set({ approvedTranslationId: cmd.translationId, updatedAt: now })
        .where(
          and(
            eq(translatableElement.id, cmd.elementId),
            eq(translatableElement.projectId, cmd.projectId),
          ),
        );
    }

    approvedTranslationId = cmd.translationId;

    const siblings = await db
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
          eq(qaReviewQueueItem.scopeKey, expectedScopeKey),
          sql`${qaReviewQueueItem.id} <> ${queueItem.id}`,
          notInArray(qaReviewQueueItem.status, ["RESOLVED", "SUPERSEDED"]),
        ),
      )
      .returning({
        id: qaReviewQueueItem.id,
        translationId: qaReviewQueueItem.translationId,
      });

    affectedSiblingQueueItemIds = siblings.map((row) => row.id);
    branchApprovalOverlayMutations =
      cmd.branchId === null || cmd.branchId === undefined
        ? []
        : [
            { translationId: cmd.translationId, approved: true },
            ...siblings
              .filter((row) => row.translationId !== null)
              .map((row) => ({
                translationId: row.translationId!,
                approved: false,
              })),
          ];
  }

  const nextStatus = cmd.action === "DEFER" ? queueItem.status : "RESOLVED";

  if (noteBody.length > 0) {
    await db
      .update(qaReviewQueueItem)
      .set({
        status: nextStatus,
        resolvedAt: nextStatus === "RESOLVED" ? now : null,
        annotationCount: sql`${qaReviewQueueItem.annotationCount} + 1`,
        unresolvedAnnotationCount: sql`${qaReviewQueueItem.unresolvedAnnotationCount} + 1`,
        lastActivityAt: now,
        optimisticVersion: sql`${qaReviewQueueItem.optimisticVersion} + 1`,
        updatedAt: now,
      })
      .where(eq(qaReviewQueueItem.id, queueItem.id));
  } else {
    await db
      .update(qaReviewQueueItem)
      .set({
        status: nextStatus,
        resolvedAt: nextStatus === "RESOLVED" ? now : null,
        lastActivityAt: now,
        optimisticVersion: sql`${qaReviewQueueItem.optimisticVersion} + 1`,
        updatedAt: now,
      })
      .where(eq(qaReviewQueueItem.id, queueItem.id));
  }

  return {
    decisionId: decision.id,
    annotationId: annotation?.id ?? null,
    queueItemId: queueItem.id,
    queueStatus: nextStatus,
    approvedTranslationId,
    affectedSiblingQueueItemIds,
    branchApprovalOverlayMutations,
  };
};

/**
 * @zh 提交 QA 工作台原子审校动作。
 * @en Submit an atomic QA workbench review action.
 *
 * @param ctx - {@zh 命令上下文} {@en Command context}
 * @param input - {@zh 命令输入} {@en Command input}
 * @returns - {@zh 审校动作结果} {@en Review action result}
 */
export const submitQaReviewAction: Command<
  z.infer<typeof SubmitQaReviewActionCommandSchema>,
  SubmitQaReviewActionCommandResult
> = async (ctx, input) => {
  const cmd = SubmitQaReviewActionCommandSchema.parse(input);
  const db = ctx.db as TxCapableDb;

  const result =
    typeof db.transaction === "function"
      ? await db.transaction(async (tx) => runSubmitQaReviewAction(tx, cmd))
      : await runSubmitQaReviewAction(ctx.db, cmd);

  return {
    result,
    events: [
      domainEvent("qa-review:decision-submitted", {
        projectId: cmd.projectId,
        queueItemId: cmd.queueItemId,
        decisionId: result.decisionId,
        decision: cmd.action,
        reviewerId: cmd.reviewerId,
      }),
    ],
  };
};
