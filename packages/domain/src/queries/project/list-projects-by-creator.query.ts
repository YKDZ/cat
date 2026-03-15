import { asc, count, eq, project } from "@cat/db";
import * as z from "zod/v4";

import type { Query } from "@/types";

export const ListProjectsByCreatorQuerySchema = z.object({
  creatorId: z.uuidv4(),
  pageIndex: z.int().min(0).optional(),
  pageSize: z.int().min(1).optional(),
});

export type ListProjectsByCreatorQuery = z.infer<
  typeof ListProjectsByCreatorQuerySchema
>;

export type ListProjectsByCreatorResult = {
  data: Array<
    Pick<
      typeof project.$inferSelect,
      "id" | "name" | "description" | "createdAt" | "updatedAt"
    >
  >;
  total: number;
};

export const listProjectsByCreator: Query<
  ListProjectsByCreatorQuery,
  ListProjectsByCreatorResult
> = async (ctx, query) => {
  const totalResult = await ctx.db
    .select({ count: count() })
    .from(project)
    .where(eq(project.creatorId, query.creatorId));

  let dataQuery = ctx.db
    .select({
      id: project.id,
      name: project.name,
      description: project.description,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
    })
    .from(project)
    .where(eq(project.creatorId, query.creatorId))
    .orderBy(asc(project.createdAt));

  if (query.pageSize !== undefined && query.pageIndex !== undefined) {
    const queryWithLimit = dataQuery
      .limit(query.pageSize)
      .offset(query.pageIndex * query.pageSize);

    return {
      data: await queryWithLimit,
      total: Number(totalResult[0]?.count ?? 0),
    };
  }

  return {
    data: await dataQuery,
    total: Number(totalResult[0]?.count ?? 0),
  };
};
