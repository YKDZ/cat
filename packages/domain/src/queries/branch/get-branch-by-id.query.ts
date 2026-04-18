import { entityBranch, eq, getColumns } from "@cat/db";
import { assertSingleOrNull } from "@cat/shared/utils";
import * as z from "zod";

import type { Query } from "@/types";

export const GetBranchByIdQuerySchema = z.object({
  /** Internal serial ID of the branch */
  branchId: z.int().positive(),
});

export type GetBranchByIdQuery = z.infer<typeof GetBranchByIdQuerySchema>;

export const getBranchById: Query<
  GetBranchByIdQuery,
  typeof entityBranch.$inferSelect | null
> = async (ctx, query) => {
  return assertSingleOrNull(
    await ctx.db
      .select({ ...getColumns(entityBranch) })
      .from(entityBranch)
      .where(eq(entityBranch.id, query.branchId))
      .limit(1),
  );
};
