import { and, eq, getColumns, issue } from "@cat/db";
import { assertSingleOrNull } from "@cat/shared/utils";
import * as z from "zod/v4";

import type { Query } from "@/types";

export const GetIssueByNumberQuerySchema = z.object({
  projectId: z.uuid(),
  number: z.int().positive(),
});

export type GetIssueByNumberQuery = z.infer<typeof GetIssueByNumberQuerySchema>;

export const getIssueByNumber: Query<
  GetIssueByNumberQuery,
  typeof issue.$inferSelect | null
> = async (ctx, query) => {
  return assertSingleOrNull(
    await ctx.db
      .select({ ...getColumns(issue) })
      .from(issue)
      .where(
        and(
          eq(issue.projectId, query.projectId),
          eq(issue.number, query.number),
        ),
      )
      .limit(1),
  );
};
