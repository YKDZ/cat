import { and, changeset, changesetEntry, eq, getColumns } from "@cat/db";
import {
  ChangesetStatusSchema,
  EntityTypeSchema,
} from "@cat/shared/schema/enum";
import { assertSingleOrNull } from "@cat/shared/utils";
import * as z from "zod";

import type { Query } from "@/types";

// ─── Get changeset by internal ID ───────────────────────────────────────────

export const GetChangesetQuerySchema = z.object({
  changesetId: z.int(),
});

export type GetChangesetQuery = z.infer<typeof GetChangesetQuerySchema>;

export const getChangeset: Query<
  GetChangesetQuery,
  typeof changeset.$inferSelect | null
> = async (ctx, query) => {
  return assertSingleOrNull(
    await ctx.db
      .select({ ...getColumns(changeset) })
      .from(changeset)
      .where(eq(changeset.id, query.changesetId))
      .limit(1),
  );
};

// ─── Get changeset by external ID ───────────────────────────────────────────

export const GetChangesetByExternalIdQuerySchema = z.object({
  externalId: z.uuid(),
});

export type GetChangesetByExternalIdQuery = z.infer<
  typeof GetChangesetByExternalIdQuerySchema
>;

export const getChangesetByExternalId: Query<
  GetChangesetByExternalIdQuery,
  typeof changeset.$inferSelect | null
> = async (ctx, query) => {
  return assertSingleOrNull(
    await ctx.db
      .select({ ...getColumns(changeset) })
      .from(changeset)
      .where(eq(changeset.externalId, query.externalId))
      .limit(1),
  );
};

// ─── List changesets for a project ──────────────────────────────────────────

export const ListChangesetsQuerySchema = z.object({
  projectId: z.uuid(),
  status: ChangesetStatusSchema.optional(),
  limit: z.int().default(20),
  offset: z.int().default(0),
});

export type ListChangesetsQuery = z.infer<typeof ListChangesetsQuerySchema>;

export const listChangesets: Query<
  ListChangesetsQuery,
  (typeof changeset.$inferSelect)[]
> = async (ctx, query) => {
  const conditions = [eq(changeset.projectId, query.projectId)];
  if (query.status) {
    conditions.push(eq(changeset.status, query.status));
  }

  return ctx.db
    .select({ ...getColumns(changeset) })
    .from(changeset)
    .where(and(...conditions))
    .limit(query.limit)
    .offset(query.offset)
    .orderBy(changeset.createdAt);
};

// ─── Get changeset entries ───────────────────────────────────────────────────

export const GetChangesetEntriesQuerySchema = z.object({
  changesetId: z.int(),
  entityType: EntityTypeSchema.optional(),
});

export type GetChangesetEntriesQuery = z.infer<
  typeof GetChangesetEntriesQuerySchema
>;

export const getChangesetEntries: Query<
  GetChangesetEntriesQuery,
  (typeof changesetEntry.$inferSelect)[]
> = async (ctx, query) => {
  const conditions = [eq(changesetEntry.changesetId, query.changesetId)];
  if (query.entityType) {
    conditions.push(eq(changesetEntry.entityType, query.entityType));
  }

  return ctx.db
    .select({ ...getColumns(changesetEntry) })
    .from(changesetEntry)
    .where(and(...conditions));
};
