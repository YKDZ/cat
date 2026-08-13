import {
  executeCommand,
  getOrCreateActiveBranchChangeset,
  type DbHandle,
} from "@cat/domain";

import { ApplicationMethodRegistry } from "./application-method-registry.ts";
import { ChangeSetService } from "./changeset-service.ts";
import { getDefaultRegistries } from "./default-registries.ts";
import { DiffStrategyRegistry } from "./diff-strategy-registry.ts";
import { VCSMiddleware } from "./vcs-middleware.ts";

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

export const ensureBranchWriteContext = async (input: {
  drizzle: DbHandle;
  branchId?: number | undefined;
  branchChangesetId?: number | undefined;
  branchProjectId?: string | undefined;
}): Promise<{
  mode: "isolation";
  projectId: string;
  branchId: number;
  branchChangesetId: number;
} | null> => {
  if (input.branchId === undefined) return null;
  if (input.branchProjectId === undefined) {
    throw new Error("branchProjectId missing when branch context is active");
  }

  const branchChangesetId =
    input.branchChangesetId ??
    (
      await executeCommand(
        { db: input.drizzle },
        getOrCreateActiveBranchChangeset,
        { branchId: input.branchId, projectId: input.branchProjectId },
      )
    ).id;

  return {
    mode: "isolation",
    projectId: input.branchProjectId,
    branchId: input.branchId,
    branchChangesetId,
  };
};
