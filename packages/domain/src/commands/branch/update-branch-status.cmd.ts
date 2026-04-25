import { entityBranch, eq, getColumns } from "@cat/db";
import { EntityBranchStatusSchema } from "@cat/shared";
import { assertSingleNonNullish } from "@cat/shared";
import * as z from "zod";

import type { Command } from "@/types";

export const UpdateBranchStatusCommandSchema = z.object({
  branchId: z.int().positive(),
  status: EntityBranchStatusSchema,
  mergedAt: z.date().optional(),
});

export type UpdateBranchStatusCommand = z.infer<
  typeof UpdateBranchStatusCommandSchema
>;

export const updateBranchStatus: Command<
  UpdateBranchStatusCommand,
  typeof entityBranch.$inferSelect
> = async (ctx, command) => {
  const updated = assertSingleNonNullish(
    await ctx.db
      .update(entityBranch)
      .set({
        status: command.status,
        mergedAt: command.mergedAt ?? null,
      })
      .where(eq(entityBranch.id, command.branchId))
      .returning({ ...getColumns(entityBranch) }),
  );

  return { result: updated, events: [] };
};
