import { changeset, desc, entityBranch, eq, getColumns } from "@cat/db";
import { assertSingleNonNullish } from "@cat/shared/utils";
import * as z from "zod";

import type { Command } from "@/types";

export const CreateBranchCommandSchema = z.object({
  projectId: z.uuid(),
  name: z.string().min(1),
  createdBy: z.uuid().optional(),
  createdByAgentId: z.int().positive().optional(),
});

export type CreateBranchCommand = z.infer<typeof CreateBranchCommandSchema>;

/**
 * @zh 创建一个新的 entity_branch，baseChangesetId 设为 main 上最新 changeset 的 ID。
 * @en Creates a new entity_branch with baseChangesetId set to the latest main changeset ID.
 */
export const createBranch: Command<
  CreateBranchCommand,
  typeof entityBranch.$inferSelect
> = async (ctx, command) => {
  // Get the latest changeset for this project as the base
  const latestChangesets = await ctx.db
    .select({ id: changeset.id })
    .from(changeset)
    .where(eq(changeset.projectId, command.projectId))
    .orderBy(desc(changeset.id))
    .limit(1);

  const baseChangesetId = latestChangesets[0]?.id ?? null;

  const inserted = assertSingleNonNullish(
    await ctx.db
      .insert(entityBranch)
      .values({
        projectId: command.projectId,
        name: command.name,
        status: "ACTIVE",
        baseChangesetId,
        createdBy: command.createdBy ?? null,
        createdByAgentId: command.createdByAgentId ?? null,
      })
      .returning({ ...getColumns(entityBranch) }),
  );

  return { result: inserted, events: [] };
};
