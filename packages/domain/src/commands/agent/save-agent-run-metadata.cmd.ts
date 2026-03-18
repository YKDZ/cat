import type { NonNullJSONType } from "@cat/shared/schema/json";

import { agentRun } from "@cat/db";
import * as z from "zod/v4";

import type { Command } from "@/types";

export const SaveAgentRunMetadataCommandSchema = z.object({
  externalId: z.string(),
  sessionId: z.int(),
  status: z.string(),
  graphDefinition: z.unknown(),
  currentNodeId: z.string().nullable(),
  deduplicationKey: z.string().nullable(),
  startedAt: z.date(),
  completedAt: z.date().nullable(),
  metadata: z.unknown().nullable(),
});

export type SaveAgentRunMetadataCommand = z.infer<
  typeof SaveAgentRunMetadataCommandSchema
>;

export const saveAgentRunMetadata: Command<
  SaveAgentRunMetadataCommand
> = async (ctx, command) => {
  // externalId has defaultRandom() so Drizzle's insert type omits it.
  // We need to supply our own UUID.
  // oxlint-disable-next-line no-unsafe-type-assertion
  const runValues = {
    externalId: command.externalId,
    sessionId: command.sessionId,
    status: command.status,
    // oxlint-disable-next-line no-unsafe-type-assertion
    graphDefinition: (command.graphDefinition ?? {}) as NonNullJSONType,
    currentNodeId: command.currentNodeId,
    deduplicationKey: command.deduplicationKey,
    startedAt: command.startedAt,
    completedAt: command.completedAt,
    // oxlint-disable-next-line no-unsafe-type-assertion
    metadata: command.metadata as NonNullJSONType | null,
  } as never;

  await ctx.db
    .insert(agentRun)
    // oxlint-disable-next-line no-unsafe-argument
    .values(runValues)
    .onConflictDoUpdate({
      target: agentRun.externalId,
      set: {
        status: command.status,
        // oxlint-disable-next-line no-unsafe-type-assertion
        graphDefinition: (command.graphDefinition ?? {}) as NonNullJSONType,
        currentNodeId: command.currentNodeId,
        deduplicationKey: command.deduplicationKey,
        // oxlint-disable-next-line no-unsafe-type-assertion
        metadata: command.metadata as NonNullJSONType | null,
        completedAt: command.completedAt,
      },
    });

  return { result: undefined, events: [] };
};
