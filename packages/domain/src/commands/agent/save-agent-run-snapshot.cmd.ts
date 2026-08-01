import { agentRun, and, eq } from "@cat/db";
import { nonNullSafeZDotJson } from "@cat/shared";
import * as z from "zod";

import type { Command, DbHandle } from "#/types.ts";

import { assertActiveAgentRunOwnership } from "./assert-agent-run-ownership.ts";

export const SaveAgentRunSnapshotCommandSchema = z.object({
  externalId: z.string(),
  snapshot: nonNullSafeZDotJson,
  ownerId: z.uuidv4().optional(),
  ownerEpoch: z.int().positive().optional(),
});

export type SaveAgentRunSnapshotCommand = z.infer<
  typeof SaveAgentRunSnapshotCommandSchema
>;

export const saveAgentRunSnapshot: Command<
  SaveAgentRunSnapshotCommand
> = async (ctx, command) => {
  const persist = async (db: DbHandle): Promise<void> => {
    if (command.ownerId !== undefined && command.ownerEpoch !== undefined) {
      await assertActiveAgentRunOwnership(db, {
        runId: command.externalId,
        ownerId: command.ownerId,
        epoch: command.ownerEpoch,
      });
    }
    const rows = await db
      .update(agentRun)
      .set({
        blackboardSnapshot: command.snapshot,
      })
      .where(
        command.ownerId === undefined || command.ownerEpoch === undefined
          ? eq(agentRun.externalId, command.externalId)
          : and(
              eq(agentRun.externalId, command.externalId),
              eq(agentRun.ownerId, command.ownerId),
              eq(agentRun.ownerEpoch, command.ownerEpoch),
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
