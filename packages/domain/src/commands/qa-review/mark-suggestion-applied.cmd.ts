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

const MarkQaReviewSuggestionAppliedCommandSchema = z
  .object({
    suggestionId: z.int().positive(),
    expectedStatus: z.literal("OPEN").default("OPEN"),
    appliedTranslationId: z.int().positive().optional(),
    appliedChangesetEntryId: z.int().positive().optional(),
    appliedBy: z.uuidv4().optional(),
  })
  .refine(
    (input) =>
      input.appliedTranslationId !== undefined ||
      input.appliedChangesetEntryId !== undefined,
    {
      message:
        "Either appliedTranslationId or appliedChangesetEntryId must be provided",
      path: ["appliedTranslationId"],
    },
  );

export type MarkQaReviewSuggestionAppliedCommand = z.infer<
  typeof MarkQaReviewSuggestionAppliedCommandSchema
>;

/**
 * @zh 将审校建议标记为已应用，并同步接受对应批注。
 * @en Mark a QA review suggestion as applied and accept the corresponding annotation.
 */
export const markQaReviewSuggestionApplied: Command<
  MarkQaReviewSuggestionAppliedCommand,
  typeof qaReviewSuggestion.$inferSelect
> = async (ctx, input) => {
  const cmd = MarkQaReviewSuggestionAppliedCommandSchema.parse(input);
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
        status: "APPLIED",
        appliedTranslationId: cmd.appliedTranslationId ?? null,
        appliedChangesetEntryId: cmd.appliedChangesetEntryId ?? null,
        appliedBy: cmd.appliedBy ?? null,
        appliedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(qaReviewSuggestion.id, suggestion.id))
      .returning({ ...getColumns(qaReviewSuggestion) }),
  );

  await ctx.db
    .update(qaReviewAnnotation)
    .set({
      status: "ACCEPTED",
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
      domainEvent("qa-review:suggestion-applied", {
        projectId: updated.projectId,
        queueItemId: annotation.queueItemId,
        suggestionId: updated.id,
        appliedTranslationId: updated.appliedTranslationId ?? undefined,
        appliedChangesetEntryId: updated.appliedChangesetEntryId ?? undefined,
        userId: updated.appliedBy ?? undefined,
      }),
    ],
  };
};
