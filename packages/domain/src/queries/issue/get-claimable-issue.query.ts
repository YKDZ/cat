import { and, asc, eq, getColumns, issue } from "@cat/db";
import { assertSingleOrNull } from "@cat/shared";
import * as z from "zod";

import type { Query } from "@/types";

export const GetClaimableIssueQuerySchema = z.object({
  projectId: z.uuid(),
  /** User ID to match against claimPolicy */
  userId: z.uuid().optional(),
  /** Agent ID to match against claimPolicy */
  agentId: z.int().positive().optional(),
});

export type GetClaimableIssueQuery = z.infer<
  typeof GetClaimableIssueQuerySchema
>;

/**
 * Returns the first claimable OPEN issue in the project (filtered by claimPolicy), without locking.
 * This is a "peek" query — actual atomic claim uses claim-issue.cmd with FOR UPDATE SKIP LOCKED.
 */
export const getClaimableIssue: Query<
  GetClaimableIssueQuery,
  typeof issue.$inferSelect | null
> = async (ctx, query) => {
  return assertSingleOrNull(
    await ctx.db
      .select({ ...getColumns(issue) })
      .from(issue)
      .where(
        and(eq(issue.projectId, query.projectId), eq(issue.status, "OPEN")),
      )
      .orderBy(asc(issue.number))
      .limit(1),
  );
};
