import { changeset, getColumns } from "@cat/db";
import { assertSingleNonNullish } from "@cat/shared/utils";
import * as z from "zod/v4";

import type { Command } from "@/types";

export const CreateChangesetCommandSchema = z.object({
  projectId: z.uuid(),
  agentRunId: z.int().optional(),
  linkedCardId: z.int().optional(),
  createdBy: z.uuid().optional(),
  summary: z.string().optional(),
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
        linkedCardId: command.linkedCardId,
        createdBy: command.createdBy,
        summary: command.summary,
        status: "PENDING",
      })
      .returning({ ...getColumns(changeset) }),
  );
  return { result: inserted, events: [] };
};
