import { changeset, getColumns } from "@cat/db";
import { ChangesetStatusSchema } from "@cat/shared/schema/enum";
import { assertSingleNonNullish } from "@cat/shared/utils";
import * as z from "zod";

import type { Command } from "@/types";

export const CreateChangesetCommandSchema = z.object({
  projectId: z.uuid(),
  agentRunId: z.int().optional(),
  createdBy: z.uuid().optional(),
  summary: z.string().optional(),
  /** Internal branch ID — set for branch-scoped changesets */
  branchId: z.int().positive().optional(),
  /** Override the default PENDING status */
  status: ChangesetStatusSchema.optional(),
});

export type CreateChangesetCommand = z.infer<
  typeof CreateChangesetCommandSchema
>;

export const createChangeset: Command<
  CreateChangesetCommand,
  typeof changeset.$inferSelect
> = async (ctx, command) => {
  const inserted = assertSingleNonNullish(
    await ctx.db
      .insert(changeset)
      .values({
        projectId: command.projectId,
        agentRunId: command.agentRunId,
        createdBy: command.createdBy,
        summary: command.summary,
        branchId: command.branchId,
        status: command.status ?? "PENDING",
      })
      .returning({ ...getColumns(changeset) }),
  );
  return { result: inserted, events: [] };
};
