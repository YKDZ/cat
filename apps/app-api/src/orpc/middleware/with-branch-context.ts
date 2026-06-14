import { executeQuery, getBranchById } from "@cat/domain";
import { determineWriteMode, getPermissionEngine } from "@cat/permissions";
import { getBranchChangesetId } from "@cat/vcs";
import { ORPCError, os } from "@orpc/server";

import type { Context } from "@/utils/context";

type BranchAwareContext = {
  user: NonNullable<Context["user"]>;
  sessionId: Context["sessionId"];
  auth: NonNullable<Context["auth"]>;
  drizzleDB: Context["drizzleDB"];
  helpers: Context["helpers"];
};

/**
 * Extracts and validates branchId, injecting branch context into the handler context.
 * When branchId is present, validates branch status and permissions.
 * When absent, returns 403 if the project has isolation_forced.
 * When branchId is not in input, it can fall back to paired
 * x-branch-id / x-branch-project-id request headers and validates that the
 * branch belongs to the resolved project.
 */
export const withBranchContext = os
  .$context<BranchAwareContext>()
  .middleware(
    async (
      { context, next },
      input: { branchId?: number; projectId?: string },
    ) => {
      // Resolve branchId: prefer input, fall back to scoped branch headers
      const headerBranchId = context.helpers.getReqHeader("x-branch-id");
      const headerBranchProjectId = context.helpers.getReqHeader(
        "x-branch-project-id",
      );
      const parsedHeader =
        headerBranchId !== undefined ? Number(headerBranchId) : undefined;
      const parsedHeaderBranchId =
        parsedHeader !== undefined && Number.isFinite(parsedHeader)
          ? parsedHeader
          : undefined;
      const branchIdSource: "input" | "header" | "none" =
        input.branchId !== undefined
          ? "input"
          : parsedHeaderBranchId !== undefined
            ? "header"
            : "none";
      const branchId =
        branchIdSource === "input" ? input.branchId : parsedHeaderBranchId;

      if (branchIdSource === "header" && headerBranchProjectId === undefined) {
        throw new ORPCError("BAD_REQUEST", {
          message: "x-branch-id requires x-branch-project-id",
        });
      }

      if (
        branchIdSource === "header" &&
        input.projectId !== undefined &&
        headerBranchProjectId !== input.projectId
      ) {
        throw new ORPCError("BAD_REQUEST", {
          message: "x-branch-project-id does not match request projectId",
        });
      }

      const projectId = input.projectId ?? headerBranchProjectId;
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

        if (projectId !== undefined && branch.projectId !== projectId) {
          throw new ORPCError("BAD_REQUEST", {
            message: `Branch ${branchId} does not belong to project ${projectId}`,
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
        const writeMode = await determineWriteMode(engine, auth, projectId);
        if (writeMode === "isolation") {
          throw new ORPCError("FORBIDDEN", {
            message: "isolation_forced: branchId is required for writes",
          });
        }
      }

      return next({});
    },
  );
