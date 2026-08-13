import {
  listAccessibleProjects,
  ProjectListSortSchema,
  type ProjectListSort,
} from "@cat/domain";
import { getPermissionEngine } from "@cat/permissions";
import type { Project } from "@cat/shared";
import * as z from "zod";

import { runAppQuery } from "#/server/domain.ts";
import { requireTelefuncAuth } from "#/server/telefunc-auth.ts";

export type PagedResult<T> = {
  data: T[];
  total: number;
};

export type ProjectListItem = Pick<
  Project,
  "id" | "name" | "description" | "createdAt" | "updatedAt"
>;

const ProjectListRequestSchema = z.strictObject({
  pageIndex: z.int().min(0),
  pageSize: z.int().min(1).max(100),
  search: z.string().trim().min(1).nullish(),
  sort: ProjectListSortSchema.optional(),
});

export const onRequestProjects = async (
  pageIndex: number,
  pageSize: number,
  search?: string | null,
  sort?: ProjectListSort,
): Promise<PagedResult<ProjectListItem>> => {
  const request = ProjectListRequestSchema.parse({
    pageIndex,
    pageSize,
    search,
    sort,
  });
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
    pageIndex: request.pageIndex,
    pageSize: request.pageSize,
    ...(request.search === undefined || request.search === null
      ? {}
      : { search: request.search }),
    ...(request.sort === undefined ? {} : { sort: request.sort }),
  });
};
