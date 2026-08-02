import { and, eq, ne, recallDerivationState, sql } from "@cat/db";
import type { RecallDerivationTargetKind } from "@cat/shared";

import type { DbHandle } from "#/types.ts";

export const invalidateRecallDerivationDemands = async (
  db: DbHandle,
  languageId?: string,
  targetKind?: RecallDerivationTargetKind,
): Promise<number> => {
  const conditions = [
    ne(recallDerivationState.status, "PENDING"),
    sql`NOT (
      ${recallDerivationState.status} = 'BLOCKED'
      AND ${recallDerivationState.blocker}->>'reason' IN ('LANGUAGE_ANALYSIS', 'TOKENIZER')
    )`,
  ];
  if (languageId !== undefined) {
    conditions.push(eq(recallDerivationState.languageId, languageId));
  }
  if (targetKind !== undefined) {
    conditions.push(eq(recallDerivationState.targetKind, targetKind));
  }
  const invalidated = await db
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
      taskProjectionRevision: sql`${recallDerivationState.taskProjectionRevision} + 1`,
      requiredDerivationVersion: null,
      updatedAt: sql`clock_timestamp()`,
    })
    .where(and(...conditions))
    .returning({ id: recallDerivationState.id });
  return invalidated.length;
};
