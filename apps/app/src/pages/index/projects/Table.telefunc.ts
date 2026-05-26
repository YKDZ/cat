import type { Project } from "@cat/shared";

import { listAccessibleProjects } from "@cat/domain";
import { getPermissionEngine } from "@cat/permissions";

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
  const engine = getPermissionEngine();
  const accessible = await engine.listObjects(
    { type: auth.subjectType, id: auth.subjectId },
    "project",
    "viewer",
  );
  const projectIds = accessible.map((o) => o.id);
  return runAppQuery(listAccessibleProjects, {
    projectIds,
    pageIndex,
    pageSize,
  });
};
