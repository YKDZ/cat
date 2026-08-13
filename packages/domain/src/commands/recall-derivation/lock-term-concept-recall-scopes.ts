import { and, asc, eq, inArray, recallDerivationState, sql } from "@cat/db";

import type { DbHandle } from "#/types.ts";

const TERM_CONCEPT_RECALL_LOCK_NAMESPACE = 1_835_102_791;

export const lockTermConceptRecallScopes = async (
  db: DbHandle,
  conceptIds: readonly number[],
): Promise<void> => {
  const sortedIds = [...new Set(conceptIds)].sort(
    (left, right) => left - right,
  );
  for (const conceptId of sortedIds) {
    await db.execute(
      sql`SELECT pg_advisory_xact_lock(${TERM_CONCEPT_RECALL_LOCK_NAMESPACE}, ${conceptId})`,
    );
  }
  if (sortedIds.length === 0) return;
  await db
    .select({ id: recallDerivationState.id })
    .from(recallDerivationState)
    .where(
      and(
        eq(recallDerivationState.targetKind, "TERM_CONCEPT"),
        inArray(recallDerivationState.targetId, sortedIds.map(String)),
      ),
    )
    .orderBy(
      sql`${recallDerivationState.targetId}::bigint`,
      asc(recallDerivationState.languageId),
      asc(recallDerivationState.id),
    )
    .for("update");
};
