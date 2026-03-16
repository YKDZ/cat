import type { NonNullJSONType } from "@cat/shared/schema/json";

import { agentEvent } from "@cat/db";
import * as z from "zod/v4";

import type { Command } from "@/types";

export const SaveAgentEventCommandSchema = z.object({
  runInternalId: z.int(),
  eventId: z.string(),
  parentEventId: z.string().nullable(),
  nodeId: z.string().nullable(),
  type: z.string(),
  payload: z.unknown(),
  timestamp: z.date(),
});

export type SaveAgentEventCommand = z.infer<typeof SaveAgentEventCommandSchema>;

export const saveAgentEvent: Command<SaveAgentEventCommand, void> = async (
  ctx,
  command,
) => {
  await ctx.db
    .insert(agentEvent)
    .values({
      runId: command.runInternalId,
      // oxlint-disable-next-line no-unsafe-type-assertion
      eventId: command.eventId as never,
      // oxlint-disable-next-line no-unsafe-type-assertion
      parentEventId: command.parentEventId as never,
      nodeId: command.nodeId,
      type: command.type,
      // oxlint-disable-next-line no-unsafe-type-assertion
      payload: (command.payload ?? {}) as NonNullJSONType,
      timestamp: command.timestamp,
    })
    .onConflictDoNothing();

  return { result: undefined, events: [] };
};
