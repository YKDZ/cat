import { changeset, entityBranch, eq, getColumns } from "@cat/db";
import { assertSingleOrNull } from "@cat/shared";
import * as z from "zod";

import { inDatabaseTransaction } from "#/infrastructure/db-transaction.ts";
import type { Command } from "#/types.ts";

export const LockActiveBranchChangesetsCommandSchema = z.strictObject({
  branchId: z.int().positive(),
});

/** Locks the branch before its changesets, matching branch append order. */
export const lockActiveBranchChangesets: Command<
  z.infer<typeof LockActiveBranchChangesetsCommandSchema>,
  typeof entityBranch.$inferSelect
> = async (ctx, input) => {
  const command = LockActiveBranchChangesetsCommandSchema.parse(input);
  const result = await inDatabaseTransaction(ctx.db, async (tx) => {
    const branch = assertSingleOrNull(
      await tx
        .select(getColumns(entityBranch))
        .from(entityBranch)
        .where(eq(entityBranch.id, command.branchId))
        .limit(1)
        .for("update"),
    );
    if (branch === null)
      throw new Error(`Branch ${command.branchId} not found`);
    if (branch.status !== "ACTIVE") {
      throw new Error(
        `Branch ${command.branchId} is not ACTIVE (status: ${branch.status})`,
      );
    }
    await tx
      .select({ id: changeset.id })
      .from(changeset)
      .where(eq(changeset.branchId, command.branchId))
      .orderBy(changeset.id)
      .for("update");
    return branch;
  });
  return { result, events: [] };
};
