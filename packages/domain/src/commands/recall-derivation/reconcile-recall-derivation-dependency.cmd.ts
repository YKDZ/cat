import { and, eq, ne, recallDerivationState, sql } from "@cat/db";
import {
  NormalizedLanguageIdSchema,
  RecallDerivationTargetKindSchema,
  RecallDerivationVersionSchema,
} from "@cat/shared";
import * as z from "zod";

import { invalidateRecallDerivationDemands } from "#/commands/recall-derivation/invalidate-recall-derivation-demands.ts";
import { inDatabaseTransaction } from "#/infrastructure/db-transaction.ts";
import type { Command } from "#/types.ts";

export const ReconcileRecallDerivationDependencyCommandSchema = z.strictObject({
  targetKind: RecallDerivationTargetKindSchema,
  languageId: NormalizedLanguageIdSchema,
  requiredDerivationVersion: RecallDerivationVersionSchema,
});

export const reconcileRecallDerivationDependency: Command<
  z.input<typeof ReconcileRecallDerivationDependencyCommandSchema>,
  { invalidated: number; pendingUpdated: number; resumed: number }
> = async (ctx, input) => {
  const command = ReconcileRecallDerivationDependencyCommandSchema.parse(input);
  const result = await inDatabaseTransaction(ctx.db, async (tx) => {
    const scope = and(
      eq(recallDerivationState.targetKind, command.targetKind),
      eq(recallDerivationState.languageId, command.languageId),
    );
    const invalidated = await tx
      .update(recallDerivationState)
      .set({
        status: "PENDING",
        demandRevision: sql`${recallDerivationState.demandRevision} + 1`,
        leaseOwnerId: null,
        leaseToken: null,
        leaseExpiresAt: null,
        retryCount: 0,
        nextAttemptAt: null,
        blocker: null,
        requiredDerivationVersion: command.requiredDerivationVersion,
        taskProjectionRevision: sql`${recallDerivationState.taskProjectionRevision} + 1`,
        updatedAt: sql`clock_timestamp()`,
      })
      .where(
        and(
          scope,
          ne(recallDerivationState.status, "PENDING"),
          sql`(${recallDerivationState.requiredDerivationVersion} IS DISTINCT FROM ${command.requiredDerivationVersion} OR (${recallDerivationState.status} = 'FRESH' AND ${recallDerivationState.currentDerivationVersion} IS DISTINCT FROM ${command.requiredDerivationVersion}))`,
        ),
      )
      .returning({ id: recallDerivationState.id });
    const pending = await tx
      .update(recallDerivationState)
      .set({
        demandRevision: sql`${recallDerivationState.demandRevision} + 1`,
        requiredDerivationVersion: command.requiredDerivationVersion,
        taskProjectionRevision: sql`${recallDerivationState.taskProjectionRevision} + 1`,
        updatedAt: sql`clock_timestamp()`,
      })
      .where(
        and(
          scope,
          eq(recallDerivationState.status, "PENDING"),
          sql`${recallDerivationState.requiredDerivationVersion} IS DISTINCT FROM ${command.requiredDerivationVersion}`,
        ),
      )
      .returning({ id: recallDerivationState.id });
    const resumed = await tx
      .update(recallDerivationState)
      .set({
        status: "PENDING",
        leaseOwnerId: null,
        leaseToken: null,
        leaseExpiresAt: null,
        retryCount: 0,
        nextAttemptAt: null,
        blocker: null,
        taskProjectionRevision: sql`${recallDerivationState.taskProjectionRevision} + 1`,
        updatedAt: sql`clock_timestamp()`,
      })
      .where(
        and(
          scope,
          eq(recallDerivationState.status, "BLOCKED"),
          eq(
            recallDerivationState.requiredDerivationVersion,
            command.requiredDerivationVersion,
          ),
          sql`${recallDerivationState.blocker}->>'reason' IN ('LANGUAGE_ANALYSIS', 'TOKENIZER')`,
        ),
      )
      .returning({ id: recallDerivationState.id });
    return {
      invalidated: invalidated.length,
      pendingUpdated: pending.length,
      resumed: resumed.length,
    };
  });
  return { result, events: [] };
};

export const MarkRecallDerivationDependencyUnverifiedCommandSchema =
  z.strictObject({
    targetKind: RecallDerivationTargetKindSchema,
    languageId: NormalizedLanguageIdSchema,
  });

export const markRecallDerivationDependencyUnverified: Command<
  z.input<typeof MarkRecallDerivationDependencyUnverifiedCommandSchema>,
  { invalidated: number }
> = async (ctx, input) => {
  const command =
    MarkRecallDerivationDependencyUnverifiedCommandSchema.parse(input);
  const invalidated = await invalidateRecallDerivationDemands(
    ctx.db,
    command.languageId,
    command.targetKind,
  );
  return { result: { invalidated }, events: [] };
};

export const InvalidateAllRecallDerivationDependenciesCommandSchema =
  z.strictObject({
    languageId: NormalizedLanguageIdSchema,
  });

export const invalidateAllRecallDerivationDependencies: Command<
  z.infer<typeof InvalidateAllRecallDerivationDependenciesCommandSchema>,
  { invalidated: number }
> = async (ctx, input) => {
  const command =
    InvalidateAllRecallDerivationDependenciesCommandSchema.parse(input);
  const invalidated = await invalidateRecallDerivationDemands(
    ctx.db,
    command.languageId,
  );
  return { result: { invalidated }, events: [] };
};
