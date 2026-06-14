import {
  eq,
  getColumns,
  qaReviewAnnotation,
  qaReviewFinding,
  qaReviewQueueItem,
  sql,
} from "@cat/db";
import {
  CreateQaReviewAnnotationInputSchema,
  assertSingleNonNullish,
} from "@cat/shared";
import * as z from "zod";

import type { Command } from "@/types";

import { domainEvent } from "@/events/domain-events";

const CreateQaReviewAnnotationCommandSchema =
  CreateQaReviewAnnotationInputSchema.extend({
    authorId: z.uuidv4().optional(),
    authorAgentId: z.int().positive().optional(),
  });

export type CreateQaReviewAnnotationCommand = z.infer<
  typeof CreateQaReviewAnnotationCommandSchema
>;

/**
 * Create an annotation under a QA review queue item and update queue activity counters.
 */
export const createQaReviewAnnotation: Command<
  CreateQaReviewAnnotationCommand,
  typeof qaReviewAnnotation.$inferSelect
> = async (ctx, input) => {
  const cmd = CreateQaReviewAnnotationCommandSchema.parse(input);
  const queueItem = assertSingleNonNullish(
    await ctx.db
      .select({ ...getColumns(qaReviewQueueItem) })
      .from(qaReviewQueueItem)
      .where(eq(qaReviewQueueItem.id, cmd.queueItemId))
      .limit(1),
  );

  if (cmd.findingId !== undefined) {
    const finding = assertSingleNonNullish(
      await ctx.db
        .select({
          id: qaReviewFinding.id,
          projectId: qaReviewFinding.projectId,
          elementId: qaReviewFinding.elementId,
          translationId: qaReviewFinding.translationId,
        })
        .from(qaReviewFinding)
        .where(eq(qaReviewFinding.id, cmd.findingId))
        .limit(1),
    );

    if (
      finding.projectId !== queueItem.projectId ||
      finding.elementId !== queueItem.elementId ||
      finding.translationId !== queueItem.translationId
    ) {
      throw new Error("Qa review finding does not belong to the queue item");
    }
  }

  let rootAnnotationId: number | null = null;
  if (cmd.parentAnnotationId !== undefined) {
    const parent = assertSingleNonNullish(
      await ctx.db
        .select({
          id: qaReviewAnnotation.id,
          queueItemId: qaReviewAnnotation.queueItemId,
          rootAnnotationId: qaReviewAnnotation.rootAnnotationId,
        })
        .from(qaReviewAnnotation)
        .where(eq(qaReviewAnnotation.id, cmd.parentAnnotationId))
        .limit(1),
    );

    if (parent.queueItemId !== queueItem.id) {
      throw new Error("Parent annotation does not belong to the queue item");
    }

    rootAnnotationId = parent.rootAnnotationId ?? parent.id;
  }

  const inserted = assertSingleNonNullish(
    await ctx.db
      .insert(qaReviewAnnotation)
      .values({
        queueItemId: queueItem.id,
        projectId: queueItem.projectId,
        elementId: queueItem.elementId,
        translationId: queueItem.translationId,
        findingId: cmd.findingId ?? null,
        authorId: cmd.authorId ?? null,
        authorAgentId: cmd.authorAgentId ?? null,
        branchId: queueItem.branchId,
        pullRequestId: queueItem.pullRequestId,
        intent: cmd.intent,
        body: cmd.body,
        targetRange: cmd.targetRange ?? null,
        quote: cmd.quote ?? null,
        isPromotable: cmd.isPromotable,
        parentAnnotationId: cmd.parentAnnotationId ?? null,
        rootAnnotationId,
      })
      .returning({ ...getColumns(qaReviewAnnotation) }),
  );

  const now = new Date();
  await ctx.db
    .update(qaReviewQueueItem)
    .set({
      annotationCount: sql`${qaReviewQueueItem.annotationCount} + 1`,
      unresolvedAnnotationCount: sql`${qaReviewQueueItem.unresolvedAnnotationCount} + 1`,
      lastActivityAt: now,
      optimisticVersion: sql`${qaReviewQueueItem.optimisticVersion} + 1`,
      updatedAt: now,
    })
    .where(eq(qaReviewQueueItem.id, queueItem.id));

  return {
    result: inserted,
    events: [
      domainEvent("qa-review:annotation-created", {
        projectId: queueItem.projectId,
        queueItemId: queueItem.id,
        annotationId: inserted.id,
        intent: inserted.intent,
        authorId: inserted.authorId ?? undefined,
      }),
    ],
  };
};
