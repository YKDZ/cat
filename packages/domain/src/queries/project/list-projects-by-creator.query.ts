import { asc, count, desc, eq, project } from "@cat/db";
import * as z from "zod";

import type { Query } from "#/types.ts";

const ProjectListSortSchema = z.strictObject({
  id: z.enum(["name", "createdAt", "updatedAt"]),
  desc: z.boolean(),
});

const listProjectsByCreatorBase = {
  creatorId: z.uuidv4(),
  sort: ProjectListSortSchema.optional(),
};

export const ListProjectsByCreatorQuerySchema = z.union([
  z.strictObject({
    ...listProjectsByCreatorBase,
    pageIndex: z.int().min(0),
    pageSize: z.int().min(1).max(100),
  }),
  z.strictObject({
    ...listProjectsByCreatorBase,
    pagination: z.literal("unpaged"),
  }),
]);

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
  const parsed = ListProjectsByCreatorQuerySchema.parse(query);
  const totalResult = await ctx.db
    .select({ count: count() })
    .from(project)
    .where(eq(project.creatorId, parsed.creatorId));

  let dataQuery = ctx.db
    .select({
      id: project.id,
      name: project.name,
      description: project.description,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
    })
    .from(project)
    .where(eq(project.creatorId, parsed.creatorId))
    .orderBy(
      ...(parsed.sort?.desc
        ? [
            desc(
              parsed.sort.id === "name"
                ? project.name
                : parsed.sort.id === "updatedAt"
                  ? project.updatedAt
                  : project.createdAt,
            ),
            desc(project.id),
          ]
        : [
            asc(
              parsed.sort?.id === "name"
                ? project.name
                : parsed.sort?.id === "updatedAt"
                  ? project.updatedAt
                  : project.createdAt,
            ),
            asc(project.id),
          ]),
    );

  if ("pageIndex" in parsed) {
    const queryWithLimit = dataQuery
      .limit(parsed.pageSize)
      .offset(parsed.pageIndex * parsed.pageSize);

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
