import { inArray, recallDerivationState, sql } from "@cat/db";
import * as z from "zod";

import { inDatabaseTransaction } from "#/infrastructure/db-transaction.ts";
import type { Command } from "#/types.ts";

export const ClaimRecallDerivationDemandsCommandSchema = z.strictObject({
  workerId: z.uuidv4(),
  limit: z.int().positive().max(100),
  leaseDurationMs: z.int().min(3_000).max(600_000),
});

export type RecallDerivationClaim = typeof recallDerivationState.$inferSelect;

export const claimRecallDerivationDemands: Command<
  z.infer<typeof ClaimRecallDerivationDemandsCommandSchema>,
  RecallDerivationClaim[]
> = async (ctx, input) => {
  const command = ClaimRecallDerivationDemandsCommandSchema.parse(input);
  const result = await inDatabaseTransaction(ctx.db, async (tx) => {
    const candidates = await tx.execute<{ id: number }>(sql`
      SELECT id
      FROM "RecallDerivationState"
      WHERE status = 'PENDING'
        AND (next_attempt_at IS NULL OR next_attempt_at <= clock_timestamp())
      ORDER BY created_at ASC, id ASC
      LIMIT ${command.limit}
      FOR UPDATE SKIP LOCKED
    `);
    const ids = candidates.rows.map((row) => row.id);
    if (ids.length === 0) return [];
    return await tx
      .update(recallDerivationState)
      .set({
        status: "RUNNING",
        leaseOwnerId: command.workerId,
        leaseToken: sql`gen_random_uuid()`,
        executionEpoch: sql`${recallDerivationState.executionEpoch} + 1`,
        taskProjectionRevision: sql`${recallDerivationState.taskProjectionRevision} + 1`,
        leaseExpiresAt: sql`clock_timestamp() + (${command.leaseDurationMs} * interval '1 millisecond')`,
        lastAttemptAt: sql`clock_timestamp()`,
        updatedAt: sql`clock_timestamp()`,
      })
      .where(inArray(recallDerivationState.id, ids))
      .returning();
  });
  return { result, events: [] };
};

export const ReconcileRecallDerivationDemandsCommandSchema = z.strictObject({});

export const ReleaseRecallDerivationWorkerLeasesCommandSchema = z.strictObject({
  workerId: z.uuidv4(),
});

export const releaseRecallDerivationWorkerLeases: Command<
  z.infer<typeof ReleaseRecallDerivationWorkerLeasesCommandSchema>,
  { released: number }
> = async (ctx, input) => {
  const command = ReleaseRecallDerivationWorkerLeasesCommandSchema.parse(input);
  const released = await ctx.db
    .update(recallDerivationState)
    .set({
      status: "PENDING",
      leaseOwnerId: null,
      leaseToken: null,
      leaseExpiresAt: null,
      taskProjectionRevision: sql`${recallDerivationState.taskProjectionRevision} + 1`,
      updatedAt: sql`clock_timestamp()`,
    })
    .where(
      sql`${recallDerivationState.status} = 'RUNNING' AND ${recallDerivationState.leaseOwnerId} = ${command.workerId}`,
    )
    .returning({ id: recallDerivationState.id });
  return { result: { released: released.length }, events: [] };
};

export type ReconcileRecallDerivationDemandsResult = {
  expiredLeaseCount: number;
  staleCount: number;
};

export const reconcileRecallDerivationDemands: Command<
  z.infer<typeof ReconcileRecallDerivationDemandsCommandSchema>,
  ReconcileRecallDerivationDemandsResult
> = async (ctx) => {
  const result = await inDatabaseTransaction(ctx.db, async (tx) => {
    const expired = await tx.execute<{ id: number }>(sql`
      UPDATE "RecallDerivationState"
      SET status = 'PENDING',
          lease_owner_id = NULL,
          lease_token = NULL,
          lease_expires_at = NULL,
          task_projection_revision = task_projection_revision + 1,
          updated_at = clock_timestamp()
      WHERE status = 'RUNNING'
        AND (lease_expires_at IS NULL OR lease_expires_at <= clock_timestamp())
      RETURNING id
    `);
    const stale = await tx.execute<{ id: number }>(sql`
      UPDATE "RecallDerivationState"
      SET status = 'PENDING',
          demand_revision = demand_revision + 1,
          lease_owner_id = NULL,
          lease_token = NULL,
          lease_expires_at = NULL,
          retry_count = 0,
          next_attempt_at = NULL,
          blocker = NULL,
          task_projection_revision = task_projection_revision + 1,
          updated_at = clock_timestamp()
      WHERE status = 'FRESH'
        AND (
          current_canonical_input_version IS DISTINCT FROM canonical_input_version
          OR current_derivation_version IS DISTINCT FROM required_derivation_version
        )
      RETURNING id
    `);
    return {
      expiredLeaseCount: expired.rows.length,
      staleCount: stale.rows.length,
    };
  });
  return { result, events: [] };
};
