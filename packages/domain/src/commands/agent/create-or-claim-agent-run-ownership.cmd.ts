import { agentRun, agentSession, eq, or, sql } from "@cat/db";
import { nonNullSafeZDotJson, safeZDotJson } from "@cat/shared";
import * as z from "zod";

import type { Command, DbHandle } from "#/types.ts";

export const CreateOrClaimAgentRunOwnershipCommandSchema = z.object({
  externalId: z.uuidv4(),
  sessionId: z.int(),
  ownerId: z.uuidv4(),
  leaseDurationMs: z.int().positive(),
  status: z.enum(["running", "paused"]),
  graphDefinition: nonNullSafeZDotJson,
  currentNodeId: z.string().nullable(),
  deduplicationKey: z.string().nullable(),
  startedAt: z.date(),
  metadata: safeZDotJson,
});

export type CreateOrClaimAgentRunOwnershipCommand = z.infer<
  typeof CreateOrClaimAgentRunOwnershipCommandSchema
>;

export type CreateOrClaimAgentRunOwnershipResult =
  | { kind: "claimed"; runId: string; epoch: number; created: boolean }
  | { kind: "conflict"; runId: string }
  | {
      kind: "identity-conflict";
      externalIdRunId: string;
      deduplicationKeyRunId: string;
    };

/**
 * Resolves a known run identity and takes its owner fence while the caller's
 * transaction already holds any higher-level execution lock.
 */
export const createOrClaimAgentRunOwnershipInTransaction = async (
  tx: DbHandle,
  command: CreateOrClaimAgentRunOwnershipCommand,
): Promise<CreateOrClaimAgentRunOwnershipResult> => {
  const [created] = await tx
    .insert(agentRun)
    .values({
      externalId: command.externalId,
      sessionId: command.sessionId,
      status: command.status,
      graphDefinition: command.graphDefinition,
      currentNodeId: command.currentNodeId,
      deduplicationKey: command.deduplicationKey,
      startedAt: command.startedAt,
      metadata: command.metadata,
      ownerId: command.ownerId,
      ownerEpoch: 1,
      ownerLeaseExpiresAt: sql`clock_timestamp() + (${command.leaseDurationMs} * interval '1 millisecond')`,
    })
    .onConflictDoNothing()
    .returning({ id: agentRun.id, externalId: agentRun.externalId });
  if (created) {
    await tx
      .update(agentSession)
      .set({ currentRunId: created.id, updatedAt: new Date() })
      .where(eq(agentSession.id, command.sessionId));
    return {
      kind: "claimed",
      runId: created.externalId,
      epoch: 1,
      created: true,
    };
  }

  const matches = await tx
    .select({
      id: agentRun.id,
      externalId: agentRun.externalId,
      deduplicationKey: agentRun.deduplicationKey,
      status: agentRun.status,
      ownerId: agentRun.ownerId,
      ownerEpoch: agentRun.ownerEpoch,
      ownerLeaseExpiresAt: agentRun.ownerLeaseExpiresAt,
    })
    .from(agentRun)
    .where(
      command.deduplicationKey === null
        ? eq(agentRun.externalId, command.externalId)
        : or(
            eq(agentRun.externalId, command.externalId),
            eq(agentRun.deduplicationKey, command.deduplicationKey),
          ),
    )
    // A single deterministic lock acquisition prevents cross-identity
    // contenders from taking the two identity rows in opposite orders.
    .orderBy(agentRun.id)
    .for("update");
  const externalIdMatch = matches.find(
    (candidate) => candidate.externalId === command.externalId,
  );
  const deduplicationKeyMatch =
    command.deduplicationKey === null
      ? undefined
      : matches.find(
          (candidate) =>
            candidate.deduplicationKey === command.deduplicationKey,
        );
  if (
    externalIdMatch !== undefined &&
    deduplicationKeyMatch !== undefined &&
    externalIdMatch.id !== deduplicationKeyMatch.id
  ) {
    return {
      kind: "identity-conflict",
      externalIdRunId: externalIdMatch.externalId,
      deduplicationKeyRunId: deduplicationKeyMatch.externalId,
    };
  }
  const current = externalIdMatch ?? deduplicationKeyMatch;
  if (!current) throw new Error("Workflow run conflict was not found.");

  // `INSERT ... ON CONFLICT` and `FOR UPDATE` can both wait. Read the
  // database clock only after those waits, then use it for all lease checks.
  const clock = await tx.execute<{ now: Date }>(
    sql`SELECT clock_timestamp() AS now`,
  );
  const now = z.coerce.date().parse(clock.rows[0]?.now);
  if (current.status !== "running" && current.status !== "paused") {
    return { kind: "conflict", runId: current.externalId };
  }
  const hasLiveOtherOwner =
    current.ownerId !== null &&
    current.ownerId !== command.ownerId &&
    current.ownerLeaseExpiresAt !== null &&
    current.ownerLeaseExpiresAt.getTime() > now.getTime();
  if (hasLiveOtherOwner) {
    return { kind: "conflict", runId: current.externalId };
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
      ownerLeaseExpiresAt: sql`clock_timestamp() + (${command.leaseDurationMs} * interval '1 millisecond')`,
    })
    .where(eq(agentRun.id, current.id));
  return {
    kind: "claimed",
    runId: current.externalId,
    epoch,
    created: false,
  };
};

/**
 * Allocates a durable known run and its owner fence together. The transaction
 * resolves either unique identity before the locked ownership decision, so a
 * loser cannot mutate the winner's initial metadata.
 */
export const createOrClaimAgentRunOwnership: Command<
  CreateOrClaimAgentRunOwnershipCommand,
  CreateOrClaimAgentRunOwnershipResult
> = async (ctx, command) => {
  const result = await ctx.db.transaction(
    async (tx) =>
      await createOrClaimAgentRunOwnershipInTransaction(tx, command),
  );

  return { result, events: [] };
};
