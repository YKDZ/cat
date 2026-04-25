import { agentRun, eq } from "@cat/db";
import { nonNullSafeZDotJson } from "@cat/shared";
import * as z from "zod";

import type { Command } from "@/types";

export const SaveAgentRunSnapshotCommandSchema = z.object({
  externalId: z.string(),
  snapshot: nonNullSafeZDotJson,
});

export type SaveAgentRunSnapshotCommand = z.infer<
  typeof SaveAgentRunSnapshotCommandSchema
>;

export const saveAgentRunSnapshot: Command<
  SaveAgentRunSnapshotCommand
> = async (ctx, command) => {
  await ctx.db
    .update(agentRun)
    .set({
      blackboardSnapshot: command.snapshot,
    })
    .where(eq(agentRun.externalId, command.externalId));

  return { result: undefined, events: [] };
};
