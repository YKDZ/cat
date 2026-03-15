import type { Project } from "@cat/shared/schema/drizzle/project";

import { listProjectsByCreator } from "@cat/domain";

import { runAppQuery } from "@/server/domain";

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
  return runAppQuery(listProjectsByCreator, {
    creatorId: userId,
    pageIndex,
    pageSize,
  });
};
