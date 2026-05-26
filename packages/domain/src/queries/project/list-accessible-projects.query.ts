import { asc, count, inArray, project } from "@cat/db";
import * as z from "zod";

import type { Query } from "@/types";

export const ListAccessibleProjectsQuerySchema = z.object({
  projectIds: z.array(z.uuidv4()),
  pageIndex: z.int().min(0).optional(),
  pageSize: z.int().min(1).optional(),
});

export type ListAccessibleProjectsQuery = z.infer<
  typeof ListAccessibleProjectsQuerySchema
>;

export type ListAccessibleProjectsResult = {
  data: Array<
    Pick<
      typeof project.$inferSelect,
      "id" | "name" | "description" | "createdAt" | "updatedAt"
    >
  >;
  total: number;
};

export const listAccessibleProjects: Query<
  ListAccessibleProjectsQuery,
  ListAccessibleProjectsResult
> = async (ctx, query) => {
  if (query.projectIds.length === 0) {
    return { data: [], total: 0 };
  }

  const filter = inArray(project.id, query.projectIds);

  const totalResult = await ctx.db
    .select({ count: count() })
    .from(project)
    .where(filter);

  const dataQuery = ctx.db
    .select({
      id: project.id,
      name: project.name,
      description: project.description,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
    })
    .from(project)
    .where(filter)
    .orderBy(asc(project.createdAt));

  if (query.pageSize !== undefined && query.pageIndex !== undefined) {
    return {
      data: await dataQuery
        .limit(query.pageSize)
        .offset(query.pageIndex * query.pageSize),
      total: totalResult[0]?.count ?? 0,
    };
  }

  return {
    data: await dataQuery,
    total: totalResult[0]?.count ?? 0,
  };
};
