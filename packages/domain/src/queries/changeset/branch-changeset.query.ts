import {
  and,
  changeset,
  changesetEntry,
  desc,
  eq,
  getColumns,
  gt,
  isNull,
} from "@cat/db";
import * as z from "zod";

import type { Query } from "@/types";

// ─── Latest changeset ID for a branch ────────────────────────────────────────

export const GetLatestBranchChangesetIdQuerySchema = z.object({
  branchId: z.int().positive(),
});

export type GetLatestBranchChangesetIdQuery = z.infer<
  typeof GetLatestBranchChangesetIdQuerySchema
>;

export const getLatestBranchChangesetId: Query<
  GetLatestBranchChangesetIdQuery,
  number | null
> = async (ctx, query) => {
  const rows = await ctx.db
    .select({ id: changeset.id })
    .from(changeset)
    .where(eq(changeset.branchId, query.branchId))
    .orderBy(desc(changeset.id))
    .limit(1);

  return rows[0]?.id ?? null;
};

// ─── Latest main (no branchId) changeset ID for a project ────────────────────

export const GetLatestMainChangesetIdQuerySchema = z.object({
  projectId: z.uuid(),
});

export type GetLatestMainChangesetIdQuery = z.infer<
  typeof GetLatestMainChangesetIdQuerySchema
>;

export const getLatestMainChangesetId: Query<
  GetLatestMainChangesetIdQuery,
  number | null
> = async (ctx, query) => {
  const rows = await ctx.db
    .select({ id: changeset.id })
    .from(changeset)
    .where(
      and(eq(changeset.projectId, query.projectId), isNull(changeset.branchId)),
    )
    .orderBy(desc(changeset.id))
    .limit(1);

  return rows[0]?.id ?? null;
};

// ─── List all changeset IDs for a branch ─────────────────────────────────────

export const ListBranchChangesetIdsQuerySchema = z.object({
  branchId: z.int().positive(),
});

export type ListBranchChangesetIdsQuery = z.infer<
  typeof ListBranchChangesetIdsQuerySchema
>;

export const listBranchChangesetIds: Query<
  ListBranchChangesetIdsQuery,
  number[]
> = async (ctx, query) => {
  const rows = await ctx.db
    .select({ id: changeset.id })
    .from(changeset)
    .where(eq(changeset.branchId, query.branchId));

  return rows.map((r) => r.id);
};

// ─── List main entries since baseChangesetId ─────────────────────────────────

export const ListMainEntriesSinceQuerySchema = z.object({
  projectId: z.uuid(),
  baseChangesetId: z.int().positive(),
});

export type ListMainEntriesSinceQuery = z.infer<
  typeof ListMainEntriesSinceQuerySchema
>;

export const listMainEntriesSince: Query<
  ListMainEntriesSinceQuery,
  (typeof changesetEntry.$inferSelect)[]
> = async (ctx, query) => {
  return ctx.db
    .select({ ...getColumns(changesetEntry) })
    .from(changesetEntry)
    .innerJoin(changeset, eq(changesetEntry.changesetId, changeset.id))
    .where(
      and(
        eq(changeset.projectId, query.projectId),
        isNull(changeset.branchId),
        gt(changeset.id, query.baseChangesetId),
      ),
    );
};
