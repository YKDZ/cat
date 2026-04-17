import { and, eq, getColumns, pullRequest } from "@cat/db";
import { PullRequestStatusSchema } from "@cat/shared/schema/enum";
import * as z from "zod/v4";

import type { Query } from "@/types";

export const ListPRsQuerySchema = z.object({
  projectId: z.uuid(),
  status: PullRequestStatusSchema.optional(),
  limit: z.int().positive().max(100).default(50),
  offset: z.int().min(0).default(0),
});

export type ListPRsQuery = z.infer<typeof ListPRsQuerySchema>;

/**
 * @zh 列出项目 PR（支持 status 筛选和分页）。
 * @en List PRs in a project with optional status filter and pagination.
 */
export const listPRs: Query<
  ListPRsQuery,
  (typeof pullRequest.$inferSelect)[]
> = async (ctx, query) => {
  const conditions = [eq(pullRequest.projectId, query.projectId)];

  if (query.status) {
    conditions.push(eq(pullRequest.status, query.status));
  }

  return ctx.db
    .select({ ...getColumns(pullRequest) })
    .from(pullRequest)
    .where(and(...conditions))
    .limit(query.limit)
    .offset(query.offset);
};
