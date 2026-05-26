import type { PageContextServer } from "vike/types";

import { render } from "vike/abort";

import { ssc } from "@/server/ssc";

type ProjectService = ReturnType<typeof ssc>["project"];
type ProjectShellProject = NonNullable<
  Awaited<ReturnType<ProjectService["get"]>>
>;
type ProjectShellTargetLanguages = Awaited<
  ReturnType<ProjectService["getTargetLanguages"]>
>;
type ProjectShellContentNodes = Awaited<
  ReturnType<ProjectService["listContentNodes"]>
>;
type SanitizedProjectPageData<T extends Record<string, unknown>> = Omit<
  T,
  "projectShell" | "pageError"
>;

const isPageContextAbortError = (
  error: unknown,
): error is Error & { _pageContextAbort: object } => {
  return (
    typeof error === "object" &&
    error !== null &&
    "_pageContextAbort" in error &&
    "_isAbortError" in error
  );
};

/**
 * @zh 项目 Shell 数据，供项目布局、Header、Navbar 和项目级注入使用。
 * @en Project shell data consumed by the project layout, header, navbar, and project-level injection.
 */
export type ProjectShellData = {
  project: ProjectShellProject;
  targetLanguages: ProjectShellTargetLanguages;
  contentNodes: ProjectShellContentNodes;
};

/**
 * @zh 项目子页可恢复错误信息。
 * @en Recoverable error information for project child pages.
 */
export type ProjectPageDataError = {
  message: string;
};

/**
 * @zh 带项目 Shell 的项目子页 data 返回值。
 * @en Project child page data with project shell data attached.
 */
export type ProjectShellPageData<T extends Record<string, unknown>> = Partial<
  SanitizedProjectPageData<T>
> & {
  projectShell: ProjectShellData;
  pageError: ProjectPageDataError | null;
};

const sanitizeProjectPageData = <T extends Record<string, unknown>>(
  pageData: T,
): SanitizedProjectPageData<T> => {
  const {
    projectShell: _projectShell,
    pageError: _pageError,
    ...rest
  } = pageData;

  return rest;
};

/**
 * @zh 从 Vike 路由上下文加载稳定的项目 Shell 数据。
 * @en Load stable project shell data from the Vike route context.
 *
 * @param ctx - {@zh Vike 服务端页面上下文} {@en Vike server page context}
 * @returns - {@zh 项目 Shell 数据} {@en Project shell data}
 */
export const loadProjectShell = async (
  ctx: PageContextServer,
): Promise<ProjectShellData> => {
  const { projectId } = ctx.routeParams;

  if (!projectId) throw render("/", "Project id is required");

  const [project, targetLanguages, contentNodes] = await Promise.all([
    ssc(ctx).project.get({ projectId }),
    ssc(ctx).project.getTargetLanguages({ projectId }),
    ssc(ctx).project.listContentNodes({ projectId }),
  ]);

  if (!project) {
    throw render("/project", `Project ${projectId} does not exists`);
  }

  return { project, targetLanguages, contentNodes };
};

/**
 * @zh 将子页专属 data 与项目 Shell data 并列组合。
 * @en Combine child page-specific data with project shell data side by side.
 *
 * @param ctx - {@zh Vike 服务端页面上下文} {@en Vike server page context}
 * @param pageData - {@zh 子页数据或其加载函数} {@en Child page data or its loader}
 * @returns - {@zh 带项目 Shell 的子页数据} {@en Child page data with project shell}
 */
export const withProjectShell = async <T extends Record<string, unknown>>(
  ctx: PageContextServer,
  pageData: T | Promise<T> | (() => T | Promise<T>),
): Promise<ProjectShellPageData<T>> => {
  const projectShell = await loadProjectShell(ctx);

  try {
    const resolvedPageData =
      typeof pageData === "function" ? await pageData() : await pageData;

    return {
      ...sanitizeProjectPageData(resolvedPageData),
      projectShell,
      pageError: null,
    };
  } catch (error) {
    if (isPageContextAbortError(error)) {
      throw error;
    }

    const emptyPageData: Partial<SanitizedProjectPageData<T>> = {};

    return {
      ...emptyPageData,
      projectShell,
      pageError: {
        message:
          error instanceof Error ? error.message : "Unknown page data error",
      },
    };
  }
};
