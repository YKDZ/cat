import type { QaFindingDisposition } from "@cat/shared";

import {
  and,
  desc,
  eq,
  getColumns,
  notInArray,
  qaReviewFinding,
  qaReviewQueueItem,
  sql,
} from "@cat/db";
import * as z from "zod";

import type { Query } from "@/types";

const CLOSED_FINDING_DISPOSITIONS = [
  "SUPPRESSED",
  "SUPERSEDED",
] satisfies QaFindingDisposition[];

export const ListQaReviewFindingsQuerySchema = z.object({
  queueItemId: z.int().positive(),
  includeSuppressed: z.boolean().default(false),
});

export type ListQaReviewFindingsQuery = z.infer<
  typeof ListQaReviewFindingsQuerySchema
>;

/**
 * List QA review findings for a queue item, hiding suppressed/superseded entries by default.
 */
export const listQaReviewFindings: Query<
  ListQaReviewFindingsQuery,
  Array<typeof qaReviewFinding.$inferSelect>
> = async (ctx, input) => {
  const query = ListQaReviewFindingsQuerySchema.parse(input);
  const queueItem = (
    await ctx.db
      .select({ ...getColumns(qaReviewQueueItem) })
      .from(qaReviewQueueItem)
      .where(eq(qaReviewQueueItem.id, query.queueItemId))
      .limit(1)
  )[0];

  if (!queueItem) return [];

  return await ctx.db
    .select({ ...getColumns(qaReviewFinding) })
    .from(qaReviewFinding)
    .where(
      and(
        eq(qaReviewFinding.projectId, queueItem.projectId),
        eq(qaReviewFinding.elementId, queueItem.elementId),
        sql`${qaReviewFinding.translationId} IS NOT DISTINCT FROM ${queueItem.translationId}`,
        query.includeSuppressed
          ? sql`TRUE`
          : notInArray(
              qaReviewFinding.disposition,
              CLOSED_FINDING_DISPOSITIONS,
            ),
      ),
    )
    .orderBy(
      desc(qaReviewFinding.riskScore),
      desc(qaReviewFinding.createdAt),
      desc(qaReviewFinding.id),
    );
};
