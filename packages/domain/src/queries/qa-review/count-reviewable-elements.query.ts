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
 * @zh 统计当前过滤条件下可审校元素数量。
 * @en Count reviewable QA elements under current filters.
 *
 * @param ctx - {@zh 查询上下文} {@en Query context}
 * @param input - {@zh 查询输入} {@en Query input}
 * @returns - {@zh 元素总数} {@en Total element count}
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
