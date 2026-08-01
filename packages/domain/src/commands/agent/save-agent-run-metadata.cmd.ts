import { agentRun, sql } from "@cat/db";
import { nonNullSafeZDotJson, safeZDotJson } from "@cat/shared";
import * as z from "zod";

import type { Command } from "#/types.ts";
import type { DbHandle } from "#/types.ts";

import { assertActiveAgentRunOwnership } from "./assert-agent-run-ownership.ts";

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
  ownerId: z.uuidv4().nullable().optional(),
  ownerEpoch: z.int().nonnegative().optional(),
  ownerLeaseExpiresAt: z.date().nullable().optional(),
});

export type SaveAgentRunMetadataCommand = z.infer<
  typeof SaveAgentRunMetadataCommandSchema
>;

export const saveAgentRunMetadata: Command<
  SaveAgentRunMetadataCommand
> = async (ctx, command) => {
  const persist = async (db: DbHandle): Promise<void> => {
    if (command.ownerId != null && command.ownerEpoch !== undefined) {
      await assertActiveAgentRunOwnership(db, {
        runId: command.externalId,
        ownerId: command.ownerId,
        epoch: command.ownerEpoch,
      });
    }
    const rows = await db
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
        ownerId: command.ownerId ?? null,
        ownerEpoch: command.ownerEpoch ?? 0,
        ownerLeaseExpiresAt: command.ownerLeaseExpiresAt ?? null,
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
        ...(command.ownerId == null || command.ownerEpoch === undefined
          ? {}
          : {
              setWhere: sql`${agentRun.ownerId} = ${command.ownerId} AND ${agentRun.ownerEpoch} = ${command.ownerEpoch}`,
            }),
      })
      .returning({ id: agentRun.id });
    if (rows.length === 0) throw new Error("Workflow owner lease lost.");
  };

  const txCandidate = ctx.db as DbHandle & {
    transaction?: (callback: (tx: DbHandle) => Promise<void>) => Promise<void>;
  };
  if (typeof txCandidate.transaction === "function") {
    await txCandidate.transaction(persist);
  } else {
    await persist(ctx.db);
  }

  return { result: undefined, events: [] };
};
