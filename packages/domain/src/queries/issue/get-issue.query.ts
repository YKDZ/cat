import { eq, getColumns, issue } from "@cat/db";
import { assertSingleOrNull } from "@cat/shared/utils";
import * as z from "zod";

import type { Query } from "@/types";

export const GetIssueQuerySchema = z.object({
  /** externalId (UUID) of the issue */
  id: z.uuid(),
});

export type GetIssueQuery = z.infer<typeof GetIssueQuerySchema>;

export const getIssue: Query<
  GetIssueQuery,
  typeof issue.$inferSelect | null
> = async (ctx, query) => {
  return assertSingleOrNull(
    await ctx.db
      .select({ ...getColumns(issue) })
      .from(issue)
      .where(eq(issue.externalId, query.id))
      .limit(1),
  );
};
