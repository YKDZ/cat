import { and, asc, count, desc, ilike, inArray, or, project } from "@cat/db";
import * as z from "zod";

import type { Query } from "#/types.ts";

export const ProjectListSortSchema = z.strictObject({
  id: z.enum(["name", "createdAt", "updatedAt"]),
  desc: z.boolean(),
});
export type ProjectListSort = z.infer<typeof ProjectListSortSchema>;

const listAccessibleProjectsBase = {
  projectIds: z.array(z.uuidv4()),
  search: z.string().trim().min(1).optional(),
  sort: ProjectListSortSchema.optional(),
};

export const ListAccessibleProjectsQuerySchema = z.union([
  z.strictObject({
    ...listAccessibleProjectsBase,
    pageIndex: z.int().min(0),
    pageSize: z.int().min(1).max(100),
  }),
  z.strictObject({
    ...listAccessibleProjectsBase,
    pagination: z.literal("unpaged"),
  }),
]);

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
  z.input<typeof ListAccessibleProjectsQuerySchema>,
  ListAccessibleProjectsResult
> = async (ctx, query) => {
  const parsed = ListAccessibleProjectsQuerySchema.parse(query);
  if (parsed.projectIds.length === 0) {
    return { data: [], total: 0 };
  }

  const searchPattern =
    parsed.search === undefined
      ? undefined
      : `%${parsed.search.replace(/[\\%_]/g, "\\$&")}%`;
  const filter = and(
    inArray(project.id, parsed.projectIds),
    searchPattern === undefined
      ? undefined
      : or(
          ilike(project.name, searchPattern),
          ilike(project.description, searchPattern),
        ),
  );

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
    return {
      data: await dataQuery
        .limit(parsed.pageSize)
        .offset(parsed.pageIndex * parsed.pageSize),
      total: totalResult[0]?.count ?? 0,
    };
  }

  return {
    data: await dataQuery,
    total: totalResult[0]?.count ?? 0,
  };
};
