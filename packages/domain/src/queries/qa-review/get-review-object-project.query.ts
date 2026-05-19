import {
  eq,
  qaReviewAnnotation,
  qaReviewQueueItem,
  qaReviewSuggestion,
} from "@cat/db";

import type { Query } from "@/types";

/**
 * @zh 根据队列项 ID 获取其所属项目。
 * @en Get the owning project for a QA review queue item.
 */
export const getQaReviewQueueItemProject: Query<
  { queueItemId: number },
  { projectId: string } | null
> = async (ctx, input) => {
  const [row] = await ctx.db
    .select({ projectId: qaReviewQueueItem.projectId })
    .from(qaReviewQueueItem)
    .where(eq(qaReviewQueueItem.id, input.queueItemId))
    .limit(1);
  return row ?? null;
};

/**
 * @zh 根据批注 ID 获取其所属项目。
 * @en Get the owning project for a QA review annotation.
 */
export const getQaReviewAnnotationProject: Query<
  { annotationId: number },
  { projectId: string } | null
> = async (ctx, input) => {
  const [row] = await ctx.db
    .select({ projectId: qaReviewAnnotation.projectId })
    .from(qaReviewAnnotation)
    .where(eq(qaReviewAnnotation.id, input.annotationId))
    .limit(1);
  return row ?? null;
};

/**
 * @zh 根据建议 ID 获取其所属项目。
 * @en Get the owning project for a QA review suggestion.
 */
export const getQaReviewSuggestionProject: Query<
  { suggestionId: number },
  { projectId: string } | null
> = async (ctx, input) => {
  const [row] = await ctx.db
    .select({ projectId: qaReviewSuggestion.projectId })
    .from(qaReviewSuggestion)
    .where(eq(qaReviewSuggestion.id, input.suggestionId))
    .limit(1);
  return row ?? null;
};
