import { and, changeset, desc, entityBranch, eq, getColumns } from "@cat/db";
import { assertSingleNonNullish } from "@cat/shared";
import * as z from "zod";

import { inDatabaseTransaction } from "#/infrastructure/db-transaction.ts";
import type { Command } from "#/types.ts";

export const GetOrCreateActiveBranchChangesetCommandSchema = z.strictObject({
  branchId: z.int().positive(),
  projectId: z.uuidv4(),
});

/** Serializes lazy branch changeset creation behind the active branch row lock. */
export const getOrCreateActiveBranchChangeset: Command<
  z.infer<typeof GetOrCreateActiveBranchChangesetCommandSchema>,
  typeof changeset.$inferSelect
> = async (ctx, input) => {
  const command = GetOrCreateActiveBranchChangesetCommandSchema.parse(input);
  const result = await inDatabaseTransaction(ctx.db, async (tx) => {
    const branch = assertSingleNonNullish(
      await tx
        .select({
          id: entityBranch.id,
          projectId: entityBranch.projectId,
          status: entityBranch.status,
        })
        .from(entityBranch)
        .where(eq(entityBranch.id, command.branchId))
        .limit(1)
        .for("update"),
    );
    if (branch.status !== "ACTIVE" || branch.projectId !== command.projectId) {
      throw new Error(
        "Branch is not an active member of the requested project.",
      );
    }
    const [existing] = await tx
      .select(getColumns(changeset))
      .from(changeset)
      .where(
        and(
          eq(changeset.branchId, command.branchId),
          eq(changeset.status, "PENDING"),
        ),
      )
      .orderBy(desc(changeset.id))
      .limit(1)
      .for("update");
    if (existing) return existing;
    return assertSingleNonNullish(
      await tx
        .insert(changeset)
        .values({
          projectId: command.projectId,
          branchId: command.branchId,
          status: "PENDING",
        })
        .returning(getColumns(changeset)),
    );
  });
  return { result, events: [] };
};
