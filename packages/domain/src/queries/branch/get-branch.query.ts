import { entityBranch, eq, getColumns } from "@cat/db";
import { assertSingleOrNull } from "@cat/shared";
import * as z from "zod";

import type { Query } from "@/types";

export const GetBranchQuerySchema = z.object({
  /** externalId (UUID) of the branch */
  id: z.uuid(),
});

export type GetBranchQuery = z.infer<typeof GetBranchQuerySchema>;

export const getBranch: Query<
  GetBranchQuery,
  typeof entityBranch.$inferSelect | null
> = async (ctx, query) => {
  return assertSingleOrNull(
    await ctx.db
      .select({ ...getColumns(entityBranch) })
      .from(entityBranch)
      .where(eq(entityBranch.externalId, query.id))
      .limit(1),
  );
};
