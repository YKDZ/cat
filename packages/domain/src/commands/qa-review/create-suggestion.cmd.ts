import {
  eq,
  getColumns,
  qaReviewAnnotation,
  qaReviewSuggestion,
} from "@cat/db";
import {
  CreateQaReviewSuggestionInputSchema,
  assertSingleNonNullish,
} from "@cat/shared";
import * as z from "zod";

import type { Command } from "@/types";

import { domainEvent } from "@/events/domain-events";

export type CreateQaReviewSuggestionCommand = z.infer<
  typeof CreateQaReviewSuggestionInputSchema
>;

/**
 * Create the unique suggestion record for an annotation whose intent is `SUGGESTION`.
 */
export const createQaReviewSuggestion: Command<
  CreateQaReviewSuggestionCommand,
  typeof qaReviewSuggestion.$inferSelect
> = async (ctx, input) => {
  const cmd = CreateQaReviewSuggestionInputSchema.parse(input);
  const annotation = assertSingleNonNullish(
    await ctx.db
      .select({
        ...getColumns(qaReviewAnnotation),
      })
      .from(qaReviewAnnotation)
      .where(eq(qaReviewAnnotation.id, cmd.annotationId))
      .limit(1),
  );

  if (annotation.intent !== "SUGGESTION") {
    throw new Error(
      "Only SUGGESTION annotations can create review suggestions",
    );
  }

  const inserted = assertSingleNonNullish(
    await ctx.db
      .insert(qaReviewSuggestion)
      .values({
        annotationId: annotation.id,
        projectId: annotation.projectId,
        elementId: annotation.elementId,
        translationId: annotation.translationId,
        proposedText: cmd.proposedText,
        targetRange: cmd.targetRange ?? null,
      })
      .returning({ ...getColumns(qaReviewSuggestion) }),
  );

  return {
    result: inserted,
    events: [
      domainEvent("qa-review:suggestion-created", {
        projectId: annotation.projectId,
        queueItemId: annotation.queueItemId,
        suggestionId: inserted.id,
        annotationId: annotation.id,
        authorId: annotation.authorId ?? undefined,
      }),
    ],
  };
};
