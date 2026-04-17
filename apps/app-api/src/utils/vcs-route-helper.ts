import type { DbHandle } from "@cat/domain";

import {
  ChangeSetService,
  getDefaultRegistries,
  VCSMiddleware,
  type ApplicationMethodRegistry,
  type DiffStrategyRegistry,
} from "@cat/vcs";

/**
 * @zh 创建 VCS 路由 helper，用于在 handler 中执行 isolation 模式写入。
 * @en Create VCS route helper for isolation mode writes in handlers.
 */
// oxlint-disable-next-line typescript/no-explicit-any
export const createVCSRouteHelper = (
  db: DbHandle,
): {
  csService: ChangeSetService;
  middleware: VCSMiddleware;
  diffRegistry: DiffStrategyRegistry;
  appMethodRegistry: ApplicationMethodRegistry;
} => {
  const { diffRegistry, appMethodRegistry } = getDefaultRegistries();
  const csService = new ChangeSetService(db, diffRegistry, appMethodRegistry);
  const middleware = new VCSMiddleware(csService, diffRegistry);
  return { csService, middleware, diffRegistry, appMethodRegistry };
};
