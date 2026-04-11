import { agentRun } from "@cat/db";
import { nonNullSafeZDotJson, safeZDotJson } from "@cat/shared/schema/json";
import * as z from "zod/v4";

import type { Command } from "@/types";

export const SaveAgentRunMetadataCommandSchema = z.object({
  externalId: z.string(),
  sessionId: z.int(),
  status: z.string(),
  graphDefinition: nonNullSafeZDotJson,
  currentNodeId: z.string().nullable(),
  deduplicationKey: z.string().nullable(),
  startedAt: z.date(),
  completedAt: z.date().nullable(),
  metadata: safeZDotJson,
});

export type SaveAgentRunMetadataCommand = z.infer<
  typeof SaveAgentRunMetadataCommandSchema
>;

export const saveAgentRunMetadata: Command<
  SaveAgentRunMetadataCommand
> = async (ctx, command) => {
  await ctx.db
    .insert(agentRun)
    .values({
      externalId: command.externalId,
      sessionId: command.sessionId,
      status: command.status,
      graphDefinition: command.graphDefinition,
      currentNodeId: command.currentNodeId,
      deduplicationKey: command.deduplicationKey,
      startedAt: command.startedAt,
      completedAt: command.completedAt,
      metadata: command.metadata,
    })
    .onConflictDoUpdate({
      target: agentRun.externalId,
      set: {
        status: command.status,
        graphDefinition: command.graphDefinition ?? {},
        currentNodeId: command.currentNodeId,
        deduplicationKey: command.deduplicationKey,
        metadata: command.metadata,
        completedAt: command.completedAt,
      },
    });

  return { result: undefined, events: [] };
};
