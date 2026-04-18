import { and, entityBranch, eq, getColumns, type SQL } from "@cat/db";
import { EntityBranchStatusSchema } from "@cat/shared/schema/enum";
import * as z from "zod";

import type { Query } from "@/types";

export const ListBranchesQuerySchema = z.object({
  projectId: z.uuid(),
  status: EntityBranchStatusSchema.optional(),
});

export type ListBranchesQuery = z.infer<typeof ListBranchesQuerySchema>;

export const listBranches: Query<
  ListBranchesQuery,
  (typeof entityBranch.$inferSelect)[]
> = async (ctx, query) => {
  const conditions: SQL[] = [eq(entityBranch.projectId, query.projectId)];

  if (query.status) {
    conditions.push(eq(entityBranch.status, query.status));
  }

  return ctx.db
    .select({ ...getColumns(entityBranch) })
    .from(entityBranch)
    .where(and(...conditions));
};
