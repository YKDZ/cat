import { agentRun, agentSession, and, eq, isNull, sql } from "@cat/db";
import { nonNullSafeZDotJson, safeZDotJson } from "@cat/shared";
import * as z from "zod";

import type { Command } from "#/types.ts";
import type { DbHandle } from "#/types.ts";

import { assertActiveAgentRunOwnership } from "./assert-agent-run-ownership.ts";

export const SaveAgentRunMetadataCommandSchema = z
  .object({
    externalId: z.string(),
    sessionId: z.int(),
    status: z.string(),
    graphDefinition: nonNullSafeZDotJson,
    currentNodeId: z.string().nullable(),
    deduplicationKey: z.string().nullable(),
    startedAt: z.date(),
    completedAt: z.date().nullable(),
    metadata: safeZDotJson,
    ownerId: z.uuidv4().optional(),
    ownerEpoch: z.int().positive().optional(),
  })
  .superRefine((value, ctx) => {
    if ((value.ownerId === undefined) !== (value.ownerEpoch === undefined)) {
      ctx.addIssue({
        code: "custom",
        path: ["ownerId"],
        message: "Agent run ownership requires both ownerId and ownerEpoch.",
      });
    }
  });

export type SaveAgentRunMetadataCommand = z.infer<
  typeof SaveAgentRunMetadataCommandSchema
>;

export const saveAgentRunMetadata: Command<
  SaveAgentRunMetadataCommand
> = async (ctx, command) => {
  if ((command.ownerId === undefined) !== (command.ownerEpoch === undefined)) {
    throw new Error(
      "Agent run ownership requires both ownerId and ownerEpoch.",
    );
  }
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
        ownerId: null,
        ownerEpoch: 0,
        ownerLeaseExpiresAt: null,
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
        ...(command.ownerId === undefined
          ? { setWhere: isNull(agentRun.ownerId) }
          : {
              setWhere: sql`${agentRun.ownerId} = ${command.ownerId} AND ${agentRun.ownerEpoch} = ${command.ownerEpoch} AND ${agentRun.ownerLeaseExpiresAt} > clock_timestamp()`,
            }),
      })
      .returning({ id: agentRun.id });
    const persisted = rows[0];
    if (!persisted) throw new Error("Workflow owner lease lost.");
    if (
      command.status === "completed" ||
      command.status === "failed" ||
      command.status === "cancelled"
    ) {
      await db
        .update(agentSession)
        .set({ currentRunId: null, updatedAt: new Date() })
        .where(
          and(
            eq(agentSession.id, command.sessionId),
            eq(agentSession.currentRunId, persisted.id),
          ),
        );
    }
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
