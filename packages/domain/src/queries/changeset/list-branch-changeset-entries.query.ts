import { and, changeset, changesetEntry, desc, eq, getColumns } from "@cat/db";
import { EntityTypeSchema } from "@cat/shared/schema/enum";
import * as z from "zod/v4";

import type { Query } from "@/types";

export const ListBranchChangesetEntriesQuerySchema = z.object({
  /** Internal serial ID of the branch */
  branchId: z.int().positive(),
  entityType: EntityTypeSchema.optional(),
  /** If provided, restrict to a single entityId */
  entityId: z.string().optional(),
  /** Maximum number of results (default: all) */
  limit: z.int().optional(),
});

export type ListBranchChangesetEntriesQuery = z.infer<
  typeof ListBranchChangesetEntriesQuerySchema
>;

export const listBranchChangesetEntries: Query<
  ListBranchChangesetEntriesQuery,
  (typeof changesetEntry.$inferSelect)[]
> = async (ctx, query) => {
  const conditions = [eq(changeset.branchId, query.branchId)];

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
    .where(and(...conditions))
    .orderBy(desc(changesetEntry.id));

  if (query.limit) {
    return q.limit(query.limit);
  }

  return q;
};
