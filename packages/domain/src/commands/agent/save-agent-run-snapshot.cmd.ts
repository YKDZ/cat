import { agentRun, and, eq, isNull, sql } from "@cat/db";
import { nonNullSafeZDotJson } from "@cat/shared";
import * as z from "zod";

import type { Command, DbHandle } from "#/types.ts";

import { assertActiveAgentRunOwnership } from "./assert-agent-run-ownership.ts";

export const SaveAgentRunSnapshotCommandSchema = z
  .object({
    externalId: z.string(),
    snapshot: nonNullSafeZDotJson,
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

export type SaveAgentRunSnapshotCommand = z.infer<
  typeof SaveAgentRunSnapshotCommandSchema
>;

export const saveAgentRunSnapshot: Command<
  SaveAgentRunSnapshotCommand
> = async (ctx, command) => {
  if ((command.ownerId === undefined) !== (command.ownerEpoch === undefined)) {
    throw new Error(
      "Agent run ownership requires both ownerId and ownerEpoch.",
    );
  }
  const ownership =
    command.ownerId === undefined || command.ownerEpoch === undefined
      ? null
      : { ownerId: command.ownerId, ownerEpoch: command.ownerEpoch };
  const persist = async (db: DbHandle): Promise<void> => {
    if (ownership) {
      await assertActiveAgentRunOwnership(db, {
        runId: command.externalId,
        ownerId: ownership.ownerId,
        epoch: ownership.ownerEpoch,
      });
    }
    const rows = await db
      .update(agentRun)
      .set({
        blackboardSnapshot: command.snapshot,
      })
      .where(
        ownership === null
          ? and(
              eq(agentRun.externalId, command.externalId),
              isNull(agentRun.ownerId),
            )
          : and(
              eq(agentRun.externalId, command.externalId),
              eq(agentRun.ownerId, ownership.ownerId),
              eq(agentRun.ownerEpoch, ownership.ownerEpoch),
              sql`${agentRun.ownerLeaseExpiresAt} > clock_timestamp()`,
            ),
      )
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
