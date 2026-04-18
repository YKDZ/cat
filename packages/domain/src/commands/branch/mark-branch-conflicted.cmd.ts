import { entityBranch, eq, getColumns } from "@cat/db";
import { assertSingleNonNullish } from "@cat/shared/utils";
import * as z from "zod";

import type { Command } from "@/types";

export const MarkBranchConflictedCommandSchema = z.object({
  branchId: z.int().positive(),
  hasConflicts: z.boolean(),
});

export type MarkBranchConflictedCommand = z.infer<
  typeof MarkBranchConflictedCommandSchema
>;

export const markBranchConflicted: Command<
  MarkBranchConflictedCommand,
  typeof entityBranch.$inferSelect
> = async (ctx, command) => {
  const updated = assertSingleNonNullish(
    await ctx.db
      .update(entityBranch)
      .set({ hasConflicts: command.hasConflicts })
      .where(eq(entityBranch.id, command.branchId))
      .returning({ ...getColumns(entityBranch) }),
  );
  return { result: updated, events: [] };
};
