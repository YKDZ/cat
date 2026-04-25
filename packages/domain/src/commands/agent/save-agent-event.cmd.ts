import { agentEvent } from "@cat/db";
import { nonNullSafeZDotJson } from "@cat/shared";
import * as z from "zod";

import type { Command } from "@/types";

export const SaveAgentEventCommandSchema = z.object({
  runInternalId: z.int(),
  eventId: z.string(),
  parentEventId: z.string().nullable(),
  nodeId: z.string().nullable(),
  type: z.string(),
  payload: nonNullSafeZDotJson,
  timestamp: z.date(),
});

export type SaveAgentEventCommand = z.infer<typeof SaveAgentEventCommandSchema>;

export const saveAgentEvent: Command<SaveAgentEventCommand> = async (
  ctx,
  command,
) => {
  await ctx.db
    .insert(agentEvent)
    .values({
      runId: command.runInternalId,
      eventId: command.eventId,
      parentEventId: command.parentEventId,
      nodeId: command.nodeId,
      type: command.type,
      payload: command.payload ?? {},
      timestamp: command.timestamp,
    })
    .onConflictDoNothing();

  return { result: undefined, events: [] };
};
