import { createChangeset, executeCommand, type DbHandle } from "@cat/domain";
import {
  ChangeSetService,
  getDefaultRegistries,
  VCSMiddleware,
  type ApplicationMethodRegistry,
  type DiffStrategyRegistry,
} from "@cat/vcs";

/**
 * Create VCS route helper for isolation mode writes in handlers.
 */
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

/**
 * Resolve branch write context and lazily create an initial changeset when the branch has none yet.
 */
export const ensureBranchWriteContext = async (input: {
  drizzle: DbHandle;
  branchId?: number;
  branchChangesetId?: number;
  branchProjectId?: string;
}): Promise<{
  mode: "isolation";
  projectId: string;
  branchId: number;
  branchChangesetId: number;
} | null> => {
  if (input.branchId === undefined) {
    return null;
  }

  if (input.branchProjectId === undefined) {
    throw new Error("branchProjectId missing when branch context is active");
  }

  const branchChangesetId =
    input.branchChangesetId ??
    (
      await executeCommand({ db: input.drizzle }, createChangeset, {
        projectId: input.branchProjectId,
        branchId: input.branchId,
        status: "PENDING",
      })
    ).id;

  return {
    mode: "isolation",
    projectId: input.branchProjectId,
    branchId: input.branchId,
    branchChangesetId,
  };
};
