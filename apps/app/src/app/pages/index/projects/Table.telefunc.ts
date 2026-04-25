import type { Project } from "@cat/shared";

import { listProjectsByCreator } from "@cat/domain";

import { runAppQuery } from "@/server/domain";
import { requireTelefuncAuth } from "@/server/telefunc-auth";

export type PagedResult<T> = {
  data: T[];
  total: number;
};

export type ProjectListItem = Pick<
  Project,
  "id" | "name" | "description" | "createdAt" | "updatedAt"
>;

export const onRequestProjects = async (
  pageIndex: number,
  pageSize: number,
): Promise<PagedResult<ProjectListItem>> => {
  const { auth } = requireTelefuncAuth();
  return runAppQuery(listProjectsByCreator, {
    creatorId: auth.subjectId,
    pageIndex,
    pageSize,
  });
};
