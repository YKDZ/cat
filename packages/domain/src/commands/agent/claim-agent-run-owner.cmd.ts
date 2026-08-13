import { agentRun, and, eq, or, sql } from "@cat/db";
import * as z from "zod";

import type { Command } from "#/types.ts";

export const ClaimAgentRunOwnerCommandSchema = z.object({
  externalId: z.uuidv4(),
  ownerId: z.uuidv4(),
  leaseDurationMs: z.int().positive(),
});
export type ClaimAgentRunOwnerCommand = z.infer<
  typeof ClaimAgentRunOwnerCommandSchema
>;
export type AgentRunOwnerLease = { epoch: number; expiresAt: Date };

/** Claims an expired run owner lease; a live owner is never displaced. */
export const claimAgentRunOwner: Command<
  ClaimAgentRunOwnerCommand,
  AgentRunOwnerLease | null
> = async (ctx, command) => {
  const result = await ctx.db.transaction(async (tx) => {
    const [current] = await tx
      .select({
        id: agentRun.id,
        status: agentRun.status,
        ownerId: agentRun.ownerId,
        ownerEpoch: agentRun.ownerEpoch,
        ownerLeaseExpiresAt: agentRun.ownerLeaseExpiresAt,
      })
      .from(agentRun)
      .where(eq(agentRun.externalId, command.externalId))
      .for("update");
    if (
      !current ||
      (current.status !== "running" && current.status !== "paused")
    )
      return null;
    const clock = await tx.execute<{ now: Date }>(
      sql`SELECT clock_timestamp() AS now`,
    );
    const now = z.coerce.date().parse(clock.rows[0]?.now);
    if (
      current.ownerId !== null &&
      current.ownerId !== command.ownerId &&
      current.ownerLeaseExpiresAt !== null &&
      current.ownerLeaseExpiresAt.getTime() > now.getTime()
    ) {
      return null;
    }
    const hasLiveSameOwnerLease =
      current.ownerId === command.ownerId &&
      current.ownerLeaseExpiresAt !== null &&
      current.ownerLeaseExpiresAt.getTime() > now.getTime();
    const epoch = hasLiveSameOwnerLease
      ? current.ownerEpoch
      : current.ownerEpoch + 1;
    await tx
      .update(agentRun)
      .set({
        ownerId: command.ownerId,
        ownerEpoch: epoch,
        ownerLeaseExpiresAt: new Date(now.getTime() + command.leaseDurationMs),
      })
      .where(eq(agentRun.id, current.id));
    return {
      epoch,
      expiresAt: new Date(now.getTime() + command.leaseDurationMs),
    };
  });
  return { result, events: [] };
};

export const RenewAgentRunOwnerCommandSchema =
  ClaimAgentRunOwnerCommandSchema.extend({
    epoch: z.int().positive(),
  });
export type RenewAgentRunOwnerCommand = z.infer<
  typeof RenewAgentRunOwnerCommandSchema
>;

/** A stale owner cannot extend or write through a newer epoch. */
export const renewAgentRunOwner: Command<
  RenewAgentRunOwnerCommand,
  boolean
> = async (ctx, command) => {
  const rows = await ctx.db
    .update(agentRun)
    .set({
      ownerLeaseExpiresAt: sql`clock_timestamp() + (${command.leaseDurationMs} * interval '1 millisecond')`,
    })
    .where(
      and(
        eq(agentRun.externalId, command.externalId),
        eq(agentRun.ownerId, command.ownerId),
        eq(agentRun.ownerEpoch, command.epoch),
        or(eq(agentRun.status, "running"), eq(agentRun.status, "paused")),
        sql`${agentRun.ownerLeaseExpiresAt} > clock_timestamp()`,
      ),
    )
    .returning({ id: agentRun.id });
  return { result: rows.length === 1, events: [] };
};
