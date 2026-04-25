import { and, eq, getColumns, pullRequest } from "@cat/db";
import { assertSingleOrNull } from "@cat/shared";
import * as z from "zod";

import type { Query } from "@/types";

export const GetPRByNumberQuerySchema = z.object({
  projectId: z.uuid(),
  number: z.int().positive(),
});

export type GetPRByNumberQuery = z.infer<typeof GetPRByNumberQuerySchema>;

/**
 * @zh 按 (projectId, number) 获取 PR。
 * @en Get a PR by (projectId, number).
 */
export const getPRByNumber: Query<
  GetPRByNumberQuery,
  typeof pullRequest.$inferSelect | null
> = async (ctx, query) => {
  return assertSingleOrNull(
    await ctx.db
      .select({ ...getColumns(pullRequest) })
      .from(pullRequest)
      .where(
        and(
          eq(pullRequest.projectId, query.projectId),
          eq(pullRequest.number, query.number),
        ),
      )
      .limit(1),
  );
};
