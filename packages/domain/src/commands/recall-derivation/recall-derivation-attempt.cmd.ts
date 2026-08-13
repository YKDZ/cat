import { and, eq, gt, recallDerivationState, sql } from "@cat/db";
import {
  CanonicalInputVersionSchema,
  classifyRecallDerivationBlocker,
  RecallDerivationBlockerSchema,
} from "@cat/shared";
import * as z from "zod";

import type { Command } from "#/types.ts";

const AttemptFenceSchema = {
  stateId: z.int().positive(),
  demandRevision: z.int().positive(),
  executionEpoch: z.int().positive(),
  leaseToken: z.uuidv4(),
  canonicalInputVersion: CanonicalInputVersionSchema,
};

export const RenewRecallDerivationLeaseCommandSchema = z.strictObject({
  ...AttemptFenceSchema,
  leaseDurationMs: z.int().min(3_000).max(600_000),
});

export const renewRecallDerivationLease: Command<
  z.infer<typeof RenewRecallDerivationLeaseCommandSchema>,
  { renewed: boolean }
> = async (ctx, input) => {
  const command = RenewRecallDerivationLeaseCommandSchema.parse(input);
  const [renewed] = await ctx.db
    .update(recallDerivationState)
    .set({
      leaseExpiresAt: sql`clock_timestamp() + (${command.leaseDurationMs} * interval '1 millisecond')`,
      updatedAt: sql`clock_timestamp()`,
    })
    .where(
      and(
        eq(recallDerivationState.id, command.stateId),
        eq(recallDerivationState.status, "RUNNING"),
        eq(recallDerivationState.demandRevision, command.demandRevision),
        eq(recallDerivationState.executionEpoch, command.executionEpoch),
        eq(recallDerivationState.leaseToken, command.leaseToken),
        eq(
          recallDerivationState.canonicalInputVersion,
          command.canonicalInputVersion,
        ),
        gt(recallDerivationState.leaseExpiresAt, sql`clock_timestamp()`),
      ),
    )
    .returning({ id: recallDerivationState.id });
  return { result: { renewed: renewed !== undefined }, events: [] };
};

export const RecordRecallDerivationFailureCommandSchema = z.strictObject({
  ...AttemptFenceSchema,
  blocker: RecallDerivationBlockerSchema,
  maxAttempts: z.int().positive().max(100),
  initialBackoffMs: z.int().positive().max(3_600_000),
  maxBackoffMs: z.int().positive().max(86_400_000),
});

export type RecordRecallDerivationFailureResult =
  | { status: "STALE" }
  | { status: "PENDING" | "BLOCKED" | "FAILED"; retryCount: number };

export const recordRecallDerivationFailure: Command<
  z.infer<typeof RecordRecallDerivationFailureCommandSchema>,
  RecordRecallDerivationFailureResult
> = async (ctx, input) => {
  const command = RecordRecallDerivationFailureCommandSchema.parse(input);
  const retryCount = await ctx.db
    .select({ retryCount: recallDerivationState.retryCount })
    .from(recallDerivationState)
    .where(
      and(
        eq(recallDerivationState.id, command.stateId),
        eq(recallDerivationState.status, "RUNNING"),
        eq(recallDerivationState.demandRevision, command.demandRevision),
        eq(recallDerivationState.executionEpoch, command.executionEpoch),
        eq(recallDerivationState.leaseToken, command.leaseToken),
        eq(
          recallDerivationState.canonicalInputVersion,
          command.canonicalInputVersion,
        ),
        gt(recallDerivationState.leaseExpiresAt, sql`clock_timestamp()`),
      ),
    )
    .limit(1);
  const current = retryCount[0];
  if (!current) return { result: { status: "STALE" }, events: [] };

  const nextRetryCount = current.retryCount + 1;
  const lifecycle = classifyRecallDerivationBlocker(command.blocker);
  const status =
    lifecycle === "PENDING" && nextRetryCount >= command.maxAttempts
      ? "FAILED"
      : lifecycle;
  const backoffMs = Math.min(
    command.maxBackoffMs,
    command.initialBackoffMs * 2 ** Math.max(0, nextRetryCount - 1),
  );
  const [updated] = await ctx.db
    .update(recallDerivationState)
    .set({
      status,
      retryCount: nextRetryCount,
      nextAttemptAt:
        status === "PENDING"
          ? sql`clock_timestamp() + (${backoffMs} * interval '1 millisecond')`
          : null,
      blocker: command.blocker,
      leaseOwnerId: null,
      leaseToken: null,
      leaseExpiresAt: null,
      taskProjectionRevision: sql`${recallDerivationState.taskProjectionRevision} + 1`,
      updatedAt: sql`clock_timestamp()`,
    })
    .where(
      and(
        eq(recallDerivationState.id, command.stateId),
        eq(recallDerivationState.status, "RUNNING"),
        eq(recallDerivationState.demandRevision, command.demandRevision),
        eq(recallDerivationState.executionEpoch, command.executionEpoch),
        eq(recallDerivationState.leaseToken, command.leaseToken),
        eq(
          recallDerivationState.canonicalInputVersion,
          command.canonicalInputVersion,
        ),
        gt(recallDerivationState.leaseExpiresAt, sql`clock_timestamp()`),
      ),
    )
    .returning({ retryCount: recallDerivationState.retryCount });
  return {
    result: updated
      ? { status, retryCount: updated.retryCount }
      : { status: "STALE" },
    events: [],
  };
};
