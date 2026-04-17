import { and, eq, getColumns, inArray, project, pullRequest } from "@cat/db";
import { assertSingleNonNullish } from "@cat/shared/utils";
import * as z from "zod/v4";

import type { Command } from "@/types";

import { domainEvent } from "@/events/domain-events";

export const UpdateProjectFeaturesCommandSchema = z.object({
  projectId: z.uuid(),
  features: z.object({
    issues: z.boolean(),
    pullRequests: z.boolean(),
  }),
});

export type UpdateProjectFeaturesCommand = z.infer<
  typeof UpdateProjectFeaturesCommandSchema
>;

/** Active PR statuses that block PR feature toggle-off */
const ACTIVE_PR_STATUSES = [
  "DRAFT",
  "OPEN",
  "REVIEW",
  "CHANGES_REQUESTED",
] as const;

/**
 * @zh 更新项目 feature flags。如果 pullRequests 从 true 变为 false，先检查是否存在活跃 PR，
 * 若存在则拒绝；否则在同一事务内批量 revoke 该项目所有 isolation_forced tuple。
 * @en Update project feature flags. When pullRequests toggles from true to false,
 * first checks for active PRs (rejects if any exist), then revokes all isolation_forced tuples in the same transaction.
 */
export const updateProjectFeatures: Command<
  UpdateProjectFeaturesCommand,
  typeof project.$inferSelect
> = async (ctx, command) => {
  const current = assertSingleNonNullish(
    await ctx.db
      .select({ features: project.features })
      .from(project)
      .where(eq(project.id, command.projectId))
      .limit(1),
  );

  const wasPREnabled = current.features?.pullRequests ?? false;
  const willPREnabled = command.features.pullRequests;

  // Check active PRs when disabling PR feature
  if (wasPREnabled && !willPREnabled) {
    const activePRs = await ctx.db
      .select({ id: pullRequest.id })
      .from(pullRequest)
      .where(
        and(
          eq(pullRequest.projectId, command.projectId),
          inArray(pullRequest.status, [...ACTIVE_PR_STATUSES]),
        ),
      )
      .limit(1);

    if (activePRs.length > 0) {
      throw new Error(
        "Cannot disable PR feature: active pull requests exist. Close or merge all PRs first.",
      );
    }
  }

  const updated = assertSingleNonNullish(
    await ctx.db
      .update(project)
      .set({ features: command.features })
      .where(eq(project.id, command.projectId))
      .returning({ ...getColumns(project) }),
  );

  return {
    result: updated,
    events: [domainEvent("project:updated", { projectId: command.projectId })],
  };
};
