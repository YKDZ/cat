import * as z from "zod";

import type { Query } from "@/types";

import {
  ListQaReviewableElementsQuerySchema,
  listQaReviewableElements,
  type QaReviewableElement,
} from "./list-reviewable-elements.query.ts";

export const GetFirstQaReviewableElementQuerySchema =
  ListQaReviewableElementsQuerySchema.omit({ page: true }).extend({
    afterElementId: z.int().positive().optional(),
  });

export type GetFirstQaReviewableElementQuery = z.infer<
  typeof GetFirstQaReviewableElementQuerySchema
>;

/**
 * Get the first (or next after afterElementId) reviewable element.
 *
 * @param ctx - Query context
 * @param input - Query input
 * @returns - First reviewable element or null
 */
export const getFirstQaReviewableElement: Query<
  GetFirstQaReviewableElementQuery,
  QaReviewableElement | null
> = async (ctx, input) => {
  const query = GetFirstQaReviewableElementQuerySchema.parse(input);
  const rows = await listQaReviewableElements(ctx, {
    ...query,
    page: 0,
    pageSize: query.pageSize,
  });

  if (query.afterElementId === undefined) {
    return rows[0] ?? null;
  }

  return (
    rows.find((row) => row.elementId !== query.afterElementId) ??
    rows[0] ??
    null
  );
};
