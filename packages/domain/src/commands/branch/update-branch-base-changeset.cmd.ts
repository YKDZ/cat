import { entityBranch, eq, getColumns } from "@cat/db";
import { assertSingleNonNullish } from "@cat/shared/utils";
import * as z from "zod";

import type { Command } from "@/types";

export const UpdateBranchBaseChangesetCommandSchema = z.object({
  branchId: z.int().positive(),
  baseChangesetId: z.int().positive().nullable(),
});

export type UpdateBranchBaseChangesetCommand = z.infer<
  typeof UpdateBranchBaseChangesetCommandSchema
>;

export const updateBranchBaseChangeset: Command<
  UpdateBranchBaseChangesetCommand,
  typeof entityBranch.$inferSelect
> = async (ctx, command) => {
  const updated = assertSingleNonNullish(
    await ctx.db
      .update(entityBranch)
      .set({ baseChangesetId: command.baseChangesetId })
      .where(eq(entityBranch.id, command.branchId))
      .returning({ ...getColumns(entityBranch) }),
  );
  return { result: updated, events: [] };
};
