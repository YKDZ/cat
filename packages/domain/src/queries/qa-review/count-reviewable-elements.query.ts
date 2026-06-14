import { sql } from "@cat/db";
import * as z from "zod";

import type { Query } from "@/types";

import {
  ListQaReviewableElementsQuerySchema,
  buildQaReviewableElementsSql,
} from "./list-reviewable-elements.query.ts";

export const CountQaReviewableElementsQuerySchema =
  ListQaReviewableElementsQuerySchema.omit({ page: true, pageSize: true });

export type CountQaReviewableElementsQuery = z.infer<
  typeof CountQaReviewableElementsQuerySchema
>;

/**
 * Count reviewable QA elements under current filters.
 *
 * @param ctx - Query context
 * @param input - Query input
 * @returns - Total element count
 */
export const countQaReviewableElements: Query<
  CountQaReviewableElementsQuery,
  number
> = async (ctx, input) => {
  const query = CountQaReviewableElementsQuerySchema.parse(input);
  const result = await ctx.db.execute<{ count: string }>(sql`
    SELECT COUNT(*)::text AS count
    FROM (${buildQaReviewableElementsSql({ ...query, page: 0, pageSize: 1 })}) reviewable_elements
  `);

  return Number(result.rows[0]?.count ?? 0);
};
