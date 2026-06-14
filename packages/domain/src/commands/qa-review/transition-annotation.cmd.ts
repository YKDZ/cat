import {
  eq,
  getColumns,
  qaReviewAnnotation,
  qaReviewQueueItem,
  sql,
} from "@cat/db";
import {
  QaReviewAnnotationStatusSchema,
  assertSingleNonNullish,
  type QaReviewAnnotationStatus,
} from "@cat/shared";
import * as z from "zod";

import type { Command } from "@/types";

const allowedAnnotationTransitions = new Map<
  QaReviewAnnotationStatus,
  QaReviewAnnotationStatus[]
>([
  ["OPEN", ["ACCEPTED", "REJECTED", "RESOLVED", "SUPERSEDED", "HIDDEN"]],
  ["ACCEPTED", ["SUPERSEDED", "HIDDEN"]],
  ["REJECTED", ["SUPERSEDED", "HIDDEN"]],
  ["RESOLVED", ["SUPERSEDED", "HIDDEN"]],
  ["SUPERSEDED", ["HIDDEN"]],
  ["HIDDEN", []],
]);

const TransitionQaReviewAnnotationCommandSchema = z.object({
  annotationId: z.int().positive(),
  status: QaReviewAnnotationStatusSchema,
  actorId: z.uuidv4().optional(),
  reason: z.string().trim().max(4000).optional(),
});

export type TransitionQaReviewAnnotationCommand = z.infer<
  typeof TransitionQaReviewAnnotationCommandSchema
>;

/**
 * Transition a QA review annotation according to the explicit state machine and sync queue unresolved counts.
 */
export const transitionQaReviewAnnotation: Command<
  TransitionQaReviewAnnotationCommand,
  typeof qaReviewAnnotation.$inferSelect
> = async (ctx, input) => {
  const cmd = TransitionQaReviewAnnotationCommandSchema.parse(input);
  const annotation = assertSingleNonNullish(
    await ctx.db
      .select({ ...getColumns(qaReviewAnnotation) })
      .from(qaReviewAnnotation)
      .where(eq(qaReviewAnnotation.id, cmd.annotationId))
      .limit(1),
  );

  if (annotation.status === cmd.status) {
    return { result: annotation, events: [] };
  }

  const allowed = allowedAnnotationTransitions.get(annotation.status) ?? [];
  if (!allowed.includes(cmd.status)) {
    throw new Error(
      `Invalid qa review annotation transition: ${annotation.status} -> ${cmd.status}`,
    );
  }

  const updated = assertSingleNonNullish(
    await ctx.db
      .update(qaReviewAnnotation)
      .set({
        status: cmd.status,
        updatedAt: new Date(),
      })
      .where(eq(qaReviewAnnotation.id, cmd.annotationId))
      .returning({ ...getColumns(qaReviewAnnotation) }),
  );

  const unresolvedDelta = annotation.status === "OPEN" ? -1 : 0;
  await ctx.db
    .update(qaReviewQueueItem)
    .set({
      unresolvedAnnotationCount:
        unresolvedDelta === 0
          ? qaReviewQueueItem.unresolvedAnnotationCount
          : sql`${qaReviewQueueItem.unresolvedAnnotationCount} + ${unresolvedDelta}`,
      lastActivityAt: new Date(),
      optimisticVersion: sql`${qaReviewQueueItem.optimisticVersion} + 1`,
      updatedAt: new Date(),
    })
    .where(eq(qaReviewQueueItem.id, annotation.queueItemId));

  return {
    result: updated,
    events: [],
  };
};
