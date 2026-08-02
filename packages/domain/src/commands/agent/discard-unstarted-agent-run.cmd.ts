import {
  agentEvent,
  agentExternalOutput,
  agentRun,
  agentSession,
  and,
  eq,
  isNull,
  or,
  sql,
} from "@cat/db";
import * as z from "zod";

import type { Command } from "#/types.ts";

export const DiscardUnstartedAgentRunCommandSchema = z.strictObject({
  runId: z.uuidv4(),
  ownerId: z.uuidv4(),
  ownerEpoch: z.int().positive(),
});
export type DiscardUnstartedAgentRunCommand = z.infer<
  typeof DiscardUnstartedAgentRunCommandSchema
>;

/** Removes a freshly allocated run only while its current owner has not published work. */
export const discardUnstartedAgentRun: Command<
  DiscardUnstartedAgentRunCommand,
  boolean
> = async (ctx, command) => {
  const result = await ctx.db.transaction(async (tx) => {
    const [run] = await tx
      .select({
        id: agentRun.id,
        sessionId: agentRun.sessionId,
        status: agentRun.status,
        blackboardSnapshot: agentRun.blackboardSnapshot,
        ownerId: agentRun.ownerId,
        ownerEpoch: agentRun.ownerEpoch,
        ownerLeaseExpiresAt: agentRun.ownerLeaseExpiresAt,
      })
      .from(agentRun)
      .where(eq(agentRun.externalId, command.runId))
      .for("update");
    const clock = await tx.execute<{ now: Date }>(
      sql`SELECT clock_timestamp() AS now`,
    );
    const now = z.coerce.date().parse(clock.rows[0]?.now);
    if (
      !run ||
      (run.status !== "running" && run.status !== "paused") ||
      run.ownerId !== command.ownerId ||
      run.ownerEpoch !== command.ownerEpoch ||
      run.ownerLeaseExpiresAt === null ||
      run.ownerLeaseExpiresAt.getTime() <= now.getTime() ||
      run.blackboardSnapshot !== null
    ) {
      return false;
    }
    const [event] = await tx
      .select({ id: agentEvent.id })
      .from(agentEvent)
      .where(eq(agentEvent.runId, run.id))
      .limit(1);
    const [output] = await tx
      .select({ id: agentExternalOutput.id })
      .from(agentExternalOutput)
      .where(eq(agentExternalOutput.runId, run.id))
      .limit(1);
    if (event || output) return false;

    const [discarded] = await tx
      .delete(agentRun)
      .where(
        and(
          eq(agentRun.id, run.id),
          eq(agentRun.ownerId, command.ownerId),
          eq(agentRun.ownerEpoch, command.ownerEpoch),
          or(eq(agentRun.status, "running"), eq(agentRun.status, "paused")),
          isNull(agentRun.blackboardSnapshot),
          sql`${agentRun.ownerLeaseExpiresAt} > clock_timestamp()`,
        ),
      )
      .returning({ id: agentRun.id });
    if (!discarded) return false;

    await tx
      .update(agentSession)
      .set({ currentRunId: null, updatedAt: sql`clock_timestamp()` })
      .where(
        and(
          eq(agentSession.id, run.sessionId),
          eq(agentSession.currentRunId, run.id),
        ),
      );
    return true;
  });
  return { result, events: [] };
};
