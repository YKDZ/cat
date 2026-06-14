import { sql } from "@cat/db";
import * as z from "zod";

import type { Query } from "@/types";

import {
  ListQaReviewQueueItemsQuerySchema,
  buildQaReviewQueueRowsSql,
} from "./list-review-queue-items.query.ts";

export const CountQaReviewQueueItemsQuerySchema =
  ListQaReviewQueueItemsQuerySchema.omit({
    page: true,
    pageSize: true,
  });

export type CountQaReviewQueueItemsQuery = z.infer<
  typeof CountQaReviewQueueItemsQuerySchema
>;

/**
 * Count QA review queue items under the current editor scope plus queue filters.
 */
export const countQaReviewQueueItems: Query<
  CountQaReviewQueueItemsQuery,
  number
> = async (ctx, input) => {
  const query = CountQaReviewQueueItemsQuerySchema.parse(input);
  const result = await ctx.db.execute<{ count: string }>(sql`
    SELECT COUNT(*)::text AS count
    FROM (${buildQaReviewQueueRowsSql({ ...query, page: 0, pageSize: 1 })}) queue_rows
  `);

  return Number(result.rows[0]?.count ?? 0);
};
