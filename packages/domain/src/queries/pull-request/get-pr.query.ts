import { eq, getColumns, pullRequest } from "@cat/db";
import { assertSingleOrNull } from "@cat/shared";
import * as z from "zod";

import type { Query } from "@/types";

export const GetPRQuerySchema = z.object({
  /** externalId (UUID) of the pull request */
  id: z.uuid(),
});

export type GetPRQuery = z.infer<typeof GetPRQuerySchema>;

/**
 * @zh 按 externalId 获取 PR（含基本信息）。
 * @en Get a PR by externalId.
 */
export const getPR: Query<
  GetPRQuery,
  typeof pullRequest.$inferSelect | null
> = async (ctx, query) => {
  return assertSingleOrNull(
    await ctx.db
      .select({ ...getColumns(pullRequest) })
      .from(pullRequest)
      .where(eq(pullRequest.externalId, query.id))
      .limit(1),
  );
};
