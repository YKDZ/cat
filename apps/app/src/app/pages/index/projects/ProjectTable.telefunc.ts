import { eq, getDrizzleDB, project, count } from "@cat/db";
import type { Project } from "@cat/shared/schema/drizzle/project";

export type PagedResult<T> = {
  data: T[];
  total: number;
};

export type ProjectListItem = Pick<
  Project,
  "id" | "name" | "description" | "createdAt" | "updatedAt"
>;

export const onRequestProjects = async (
  userId: string,
  pageIndex: number,
  pageSize: number,
): Promise<PagedResult<ProjectListItem>> => {
  const { client: drizzle } = await getDrizzleDB();

  // 查询总数
  const totalResult = await drizzle
    .select({ count: count() })
    .from(project)
    .where(eq(project.creatorId, userId));

  const total = Number(totalResult[0]?.count ?? 0);

  // 查询数据
  const data = await drizzle
    .select({
      id: project.id,
      name: project.name,
      description: project.description,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
    })
    .from(project)
    .where(eq(project.creatorId, userId))
    .orderBy(project.createdAt)
    .limit(pageSize)
    .offset(pageIndex * pageSize);

  return {
    data,
    total,
  };
};
