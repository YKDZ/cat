import {
  alias,
  eq,
  qaReviewAnnotation,
  qaReviewQueueItem,
  qaReviewSuggestion,
  translation,
} from "@cat/db";
import * as z from "zod";

import type { Query } from "@/types";

const parentAnnotation = alias(qaReviewAnnotation, "parentQaReviewAnnotation");

export const GetQaReviewNotificationRecipientQuerySchema = z
  .object({
    queueItemId: z.int().positive().optional(),
    annotationId: z.int().positive().optional(),
    suggestionId: z.int().positive().optional(),
    triggererId: z.uuidv4().optional(),
  })
  .refine(
    (input) =>
      input.queueItemId !== undefined ||
      input.annotationId !== undefined ||
      input.suggestionId !== undefined,
    {
      message: "queueItemId, annotationId, or suggestionId is required",
      path: ["queueItemId"],
    },
  );

export type GetQaReviewNotificationRecipientQuery = z.infer<
  typeof GetQaReviewNotificationRecipientQuerySchema
>;

export type GetQaReviewNotificationRecipientResult = {
  userId: string;
} | null;

/**
 * @zh 解析审校通知应发送给的用户，避免把通知发回给触发者本人。
 * @en Resolve the user who should receive a QA review notification while avoiding self-notifications.
 */
export const getQaReviewNotificationRecipient: Query<
  GetQaReviewNotificationRecipientQuery,
  GetQaReviewNotificationRecipientResult
> = async (ctx, input) => {
  const query = GetQaReviewNotificationRecipientQuerySchema.parse(input);

  let recipientId: string | null = null;

  if (query.suggestionId !== undefined) {
    const [row] = await ctx.db
      .select({
        annotationAuthorId: qaReviewAnnotation.authorId,
        translatorId: translation.translatorId,
      })
      .from(qaReviewSuggestion)
      .innerJoin(
        qaReviewAnnotation,
        eq(qaReviewAnnotation.id, qaReviewSuggestion.annotationId),
      )
      .leftJoin(
        qaReviewQueueItem,
        eq(qaReviewQueueItem.id, qaReviewAnnotation.queueItemId),
      )
      .leftJoin(
        translation,
        eq(translation.id, qaReviewQueueItem.translationId),
      )
      .where(eq(qaReviewSuggestion.id, query.suggestionId))
      .limit(1);

    recipientId = row?.annotationAuthorId ?? row?.translatorId ?? null;
  } else if (query.annotationId !== undefined) {
    const [row] = await ctx.db
      .select({
        parentAuthorId: parentAnnotation.authorId,
        translatorId: translation.translatorId,
      })
      .from(qaReviewAnnotation)
      .leftJoin(
        parentAnnotation,
        eq(parentAnnotation.id, qaReviewAnnotation.parentAnnotationId),
      )
      .leftJoin(
        qaReviewQueueItem,
        eq(qaReviewQueueItem.id, qaReviewAnnotation.queueItemId),
      )
      .leftJoin(
        translation,
        eq(translation.id, qaReviewQueueItem.translationId),
      )
      .where(eq(qaReviewAnnotation.id, query.annotationId))
      .limit(1);

    recipientId = row?.parentAuthorId ?? row?.translatorId ?? null;
  } else if (query.queueItemId !== undefined) {
    const [row] = await ctx.db
      .select({ userId: translation.translatorId })
      .from(qaReviewQueueItem)
      .leftJoin(
        translation,
        eq(translation.id, qaReviewQueueItem.translationId),
      )
      .where(eq(qaReviewQueueItem.id, query.queueItemId))
      .limit(1);

    recipientId = row?.userId ?? null;
  }

  if (recipientId === null || recipientId === query.triggererId) {
    return null;
  }

  return { userId: recipientId };
};
