import { and, eq, ilike, ne, pullRequest } from "@cat/db";
import {
  PullRequestStatusSchema,
  PullRequestTypeSchema,
} from "@cat/shared/schema/enum";
import * as z from "zod/v4";

import type { Query } from "@/types";

export const ListPRsQuerySchema = z.object({
  projectId: z.uuid(),
  status: PullRequestStatusSchema.optional(),
  type: PullRequestTypeSchema.optional(),
  excludeTypes: z.array(PullRequestTypeSchema).optional(),
  search: z.string().optional(),
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

  if (query.type) {
    conditions.push(eq(pullRequest.type, query.type));
  }

  if (query.excludeTypes && query.excludeTypes.length > 0) {
    for (const t of query.excludeTypes) {
      conditions.push(ne(pullRequest.type, t));
    }
  }

  if (query.search) {
    const escaped = query.search.replace(/%/g, "\\%").replace(/_/g, "\\_");
    conditions.push(ilike(pullRequest.title, `%${escaped}%`));
  }

  return ctx.db
    .select()
    .from(pullRequest)
    .where(and(...conditions))
    .limit(query.limit)
    .offset(query.offset);
};
