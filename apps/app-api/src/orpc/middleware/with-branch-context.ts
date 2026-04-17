import { executeQuery, getBranchById } from "@cat/domain";
import { determineTrustMode, getPermissionEngine } from "@cat/permissions";
import { getBranchChangesetId } from "@cat/vcs";
import { ORPCError, os } from "@orpc/server";

import type { Context } from "@/utils/context";

type BranchAwareContext = {
  user: NonNullable<Context["user"]>;
  sessionId: Context["sessionId"];
  auth: NonNullable<Context["auth"]>;
  drizzleDB: Context["drizzleDB"];
};

/**
 * @zh 提取并验证 branchId，将分支上下文注入到 context 中。
 * branchId 存在时验证 branch 状态和权限，并注入 branchId/branchChangesetId/branchProjectId。
 * branchId 不存在时，若 projectId 有 isolation_forced 则返回 403。
 * @en Extracts and validates branchId, injecting branch context into the handler context.
 * When branchId is present, validates branch status and permissions.
 * When absent, returns 403 if the project has isolation_forced.
 */
export const withBranchContext = os
  .$context<BranchAwareContext>()
  .middleware(
    async (
      { context, next },
      input: { branchId?: number; projectId?: string },
    ) => {
      const { branchId, projectId } = input;
      const {
        drizzleDB: { client: db },
        auth,
      } = context;

      if (branchId !== undefined) {
        // Validate branch exists
        const branch = await executeQuery({ db }, getBranchById, { branchId });
        if (!branch) {
          throw new ORPCError("NOT_FOUND", {
            message: `Branch ${branchId} not found`,
          });
        }

        // Validate branch is ACTIVE
        if (branch.status !== "ACTIVE") {
          throw new ORPCError("CONFLICT", {
            message: `Branch ${branchId} is not ACTIVE (status: ${branch.status})`,
          });
        }

        // Check editor permission on the branch's project
        const engine = getPermissionEngine();
        const allowed = await engine.check(
          auth,
          { type: "project", id: branch.projectId },
          "editor",
        );
        if (!allowed) {
          throw new ORPCError("FORBIDDEN", {
            message: "No editor permission on branch project",
          });
        }

        const branchChangesetId = await getBranchChangesetId(db, branchId);

        return next({
          context: {
            branchId,
            branchChangesetId: branchChangesetId ?? undefined,
            branchProjectId: branch.projectId,
          },
        });
      }

      // No branchId — check isolation mode if projectId is provided
      if (projectId) {
        const engine = getPermissionEngine();
        const trustMode = await determineTrustMode(engine, auth, projectId);
        if (trustMode === "isolation") {
          throw new ORPCError("FORBIDDEN", {
            message: "isolation_forced: branchId is required for writes",
          });
        }
      }

      return next({});
    },
  );
