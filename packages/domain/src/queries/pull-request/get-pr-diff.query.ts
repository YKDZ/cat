import {
  and,
  changeset,
  changesetEntry,
  eq,
  getColumns,
  pullRequest,
} from "@cat/db";
import { EntityTypeSchema } from "@cat/shared/schema/enum";
import * as z from "zod";

import type { Query } from "@/types";

export const GetPRDiffQuerySchema = z.object({
  /** Internal ID of the pull request */
  prId: z.int().positive(),
  entityType: EntityTypeSchema.optional(),
  entityId: z.string().optional(),
  limit: z.int().positive().max(500).optional(),
});

export type GetPRDiffQuery = z.infer<typeof GetPRDiffQuerySchema>;

/**
 * @zh 获取 PR 关联分支的变更 diff（ChangesetEntry 列表）。
 * @en Get the changeset entries (diff) for the branch associated with the PR.
 */
export const getPRDiff: Query<
  GetPRDiffQuery,
  (typeof changesetEntry.$inferSelect)[]
> = async (ctx, query) => {
  // First get branchId from PR
  const pr = await ctx.db
    .select({ branchId: pullRequest.branchId })
    .from(pullRequest)
    .where(eq(pullRequest.id, query.prId))
    .limit(1);

  const branchId = pr[0]?.branchId;
  if (branchId === undefined) {
    return [];
  }

  const conditions = [eq(changeset.branchId, branchId)];

  if (query.entityType) {
    conditions.push(eq(changesetEntry.entityType, query.entityType));
  }
  if (query.entityId) {
    conditions.push(eq(changesetEntry.entityId, query.entityId));
  }

  const q = ctx.db
    .select({ ...getColumns(changesetEntry) })
    .from(changesetEntry)
    .innerJoin(changeset, eq(changesetEntry.changesetId, changeset.id))
    .where(and(...conditions));

  if (query.limit) {
    return q.limit(query.limit);
  }

  return q;
};
