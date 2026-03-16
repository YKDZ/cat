import type { NonNullJSONType } from "@cat/shared/schema/json";

import { agentRun, eq } from "@cat/db";
import * as z from "zod/v4";

import type { Command } from "@/types";

export const SaveAgentRunSnapshotCommandSchema = z.object({
  externalId: z.string(),
  snapshot: z.unknown(),
});

export type SaveAgentRunSnapshotCommand = z.infer<
  typeof SaveAgentRunSnapshotCommandSchema
>;

export const saveAgentRunSnapshot: Command<
  SaveAgentRunSnapshotCommand,
  void
> = async (ctx, command) => {
  await ctx.db
    .update(agentRun)
    .set({
      // oxlint-disable-next-line no-unsafe-type-assertion
      blackboardSnapshot: command.snapshot as NonNullJSONType,
    })
    .where(eq(agentRun.externalId, command.externalId));

  return { result: undefined, events: [] };
};
