import { agentRun, agentSession, and, eq, isNull, sql } from "@cat/db";
import * as z from "zod";

import type { Command, DbHandle } from "#/types.ts";

import { assertActiveAgentRunOwnership } from "./assert-agent-run-ownership.ts";

export const FinishAgentRunCommandSchema = z
  .object({
    /**
     * agentRun external UUID
     */
    runId: z.uuidv4(),
    /**
     * Final run status
     */
    status: z.enum(["completed", "failed", "cancelled"]),
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

export type FinishAgentRunCommand = z.infer<typeof FinishAgentRunCommandSchema>;

/**
 * Update AgentRun status to a terminal state and record completion time.
 */
export const finishAgentRun: Command<FinishAgentRunCommand> = async (
  ctx,
  command,
) => {
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
        runId: command.runId,
        ownerId: ownership.ownerId,
        epoch: ownership.ownerEpoch,
      });
    }
    const rows = await db
      .update(agentRun)
      .set({ status: command.status, completedAt: new Date() })
      .where(
        ownership === null
          ? and(
              eq(agentRun.externalId, command.runId),
              isNull(agentRun.ownerId),
            )
          : and(
              eq(agentRun.externalId, command.runId),
              eq(agentRun.ownerId, ownership.ownerId),
              eq(agentRun.ownerEpoch, ownership.ownerEpoch),
              sql`${agentRun.ownerLeaseExpiresAt} > clock_timestamp()`,
            ),
      )
      .returning({ id: agentRun.id, sessionId: agentRun.sessionId });
    if (rows.length === 0) throw new Error("Workflow owner lease lost.");
    const completed = rows[0];
    if (!completed) throw new Error("Workflow owner lease lost.");
    await db
      .update(agentSession)
      .set({ currentRunId: null, updatedAt: new Date() })
      .where(
        and(
          eq(agentSession.id, completed.sessionId),
          eq(agentSession.currentRunId, completed.id),
        ),
      );
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
