import {
  eq,
  getColumns,
  qaReviewAnnotation,
  qaReviewQueueItem,
  qaReviewSuggestion,
  sql,
} from "@cat/db";
import { assertSingleNonNullish } from "@cat/shared";
import * as z from "zod";

import type { Command } from "@/types";

import { domainEvent } from "@/events/domain-events";

class QaReviewConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "QaReviewConflictError";
  }
}

const RejectQaReviewSuggestionCommandSchema = z.object({
  suggestionId: z.int().positive(),
  rejectedBy: z.uuidv4(),
  rejectionReason: z.string().trim().min(1).max(4000),
  expectedStatus: z.literal("OPEN").default("OPEN"),
});

export type RejectQaReviewSuggestionCommand = z.infer<
  typeof RejectQaReviewSuggestionCommandSchema
>;

/**
 * @zh 拒绝一条开放中的审校建议，并同步拒绝对应批注。
 * @en Reject an open QA review suggestion and reject the corresponding annotation.
 */
export const rejectQaReviewSuggestion: Command<
  RejectQaReviewSuggestionCommand,
  typeof qaReviewSuggestion.$inferSelect
> = async (ctx, input) => {
  const cmd = RejectQaReviewSuggestionCommandSchema.parse(input);
  const suggestion = assertSingleNonNullish(
    await ctx.db
      .select({ ...getColumns(qaReviewSuggestion) })
      .from(qaReviewSuggestion)
      .where(eq(qaReviewSuggestion.id, cmd.suggestionId))
      .limit(1),
  );

  if (suggestion.status !== cmd.expectedStatus) {
    throw new QaReviewConflictError(
      "QA review suggestion state changed. Refresh and try again.",
    );
  }

  const annotation = assertSingleNonNullish(
    await ctx.db
      .select({ ...getColumns(qaReviewAnnotation) })
      .from(qaReviewAnnotation)
      .where(eq(qaReviewAnnotation.id, suggestion.annotationId))
      .limit(1),
  );

  const updated = assertSingleNonNullish(
    await ctx.db
      .update(qaReviewSuggestion)
      .set({
        status: "REJECTED",
        rejectionReason: cmd.rejectionReason,
        updatedAt: new Date(),
      })
      .where(eq(qaReviewSuggestion.id, suggestion.id))
      .returning({ ...getColumns(qaReviewSuggestion) }),
  );

  await ctx.db
    .update(qaReviewAnnotation)
    .set({
      status: "REJECTED",
      updatedAt: new Date(),
    })
    .where(eq(qaReviewAnnotation.id, annotation.id));

  await ctx.db
    .update(qaReviewQueueItem)
    .set({
      unresolvedAnnotationCount:
        annotation.status === "OPEN"
          ? sql`${qaReviewQueueItem.unresolvedAnnotationCount} - 1`
          : qaReviewQueueItem.unresolvedAnnotationCount,
      lastActivityAt: new Date(),
      optimisticVersion: sql`${qaReviewQueueItem.optimisticVersion} + 1`,
      updatedAt: new Date(),
    })
    .where(eq(qaReviewQueueItem.id, annotation.queueItemId));

  return {
    result: updated,
    events: [
      domainEvent("qa-review:suggestion-rejected", {
        projectId: updated.projectId,
        queueItemId: annotation.queueItemId,
        suggestionId: updated.id,
        annotationId: annotation.id,
        rejectedBy: cmd.rejectedBy,
      }),
    ],
  };
};
