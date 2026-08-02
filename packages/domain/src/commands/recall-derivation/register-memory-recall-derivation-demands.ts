import { and, eq, notInArray, recallDerivationState, sql } from "@cat/db";
import {
  computeMemoryCanonicalInputVersion,
  RecallDerivationReferenceSchema,
  type RecallDerivationReference,
} from "@cat/shared";

import { listMemoryCanonicalSnapshots } from "#/queries/recall-derivation/get-memory-canonical-snapshots.query.ts";
import type { DbHandle } from "#/types.ts";

export const registerMemoryRecallDerivationDemands = async (
  db: DbHandle,
  memoryItemIds: readonly number[],
): Promise<RecallDerivationReference[]> => {
  const snapshots = await listMemoryCanonicalSnapshots({ db }, memoryItemIds);
  const snapshotRows = await Promise.all(
    snapshots.map(async (snapshot) => {
      const canonicalInputVersion =
        await computeMemoryCanonicalInputVersion(snapshot);
      return [
        ...new Set([
          snapshot.source.languageId,
          snapshot.translation.languageId,
        ]),
      ].map((languageId) => ({
        targetKind: "MEMORY_ITEM" as const,
        targetId: String(snapshot.id),
        languageId,
        canonicalInputVersion,
      }));
    }),
  );
  const rows = [
    ...new Map(
      snapshotRows
        .flat()
        .map((row) => [
          `${row.targetKind}\0${row.targetId}\0${row.languageId}`,
          row,
        ]),
    ).values(),
  ];
  for (const snapshot of snapshots) {
    const currentLanguageIds = [
      ...new Set([snapshot.source.languageId, snapshot.translation.languageId]),
    ];
    await db
      .delete(recallDerivationState)
      .where(
        and(
          eq(recallDerivationState.targetKind, "MEMORY_ITEM"),
          eq(recallDerivationState.targetId, String(snapshot.id)),
          notInArray(recallDerivationState.languageId, currentLanguageIds),
        ),
      );
  }
  if (rows.length === 0) return [];

  const registered = await db
    .insert(recallDerivationState)
    .values(rows)
    .onConflictDoUpdate({
      target: [
        recallDerivationState.targetKind,
        recallDerivationState.targetId,
        recallDerivationState.languageId,
      ],
      set: {
        canonicalInputVersion: sql`excluded.canonical_input_version`,
        demandRevision: sql`CASE WHEN ${recallDerivationState.canonicalInputVersion} = excluded.canonical_input_version THEN ${recallDerivationState.demandRevision} ELSE ${recallDerivationState.demandRevision} + 1 END`,
        status: sql`CASE WHEN ${recallDerivationState.canonicalInputVersion} = excluded.canonical_input_version THEN ${recallDerivationState.status} ELSE 'PENDING'::"RecallDerivationStatus" END`,
        leaseOwnerId: sql`CASE WHEN ${recallDerivationState.canonicalInputVersion} = excluded.canonical_input_version THEN ${recallDerivationState.leaseOwnerId} ELSE NULL END`,
        leaseToken: sql`CASE WHEN ${recallDerivationState.canonicalInputVersion} = excluded.canonical_input_version THEN ${recallDerivationState.leaseToken} ELSE NULL END`,
        leaseExpiresAt: sql`CASE WHEN ${recallDerivationState.canonicalInputVersion} = excluded.canonical_input_version THEN ${recallDerivationState.leaseExpiresAt} ELSE NULL END`,
        retryCount: sql`CASE WHEN ${recallDerivationState.canonicalInputVersion} = excluded.canonical_input_version THEN ${recallDerivationState.retryCount} ELSE 0 END`,
        nextAttemptAt: sql`CASE WHEN ${recallDerivationState.canonicalInputVersion} = excluded.canonical_input_version THEN ${recallDerivationState.nextAttemptAt} ELSE NULL END`,
        blocker: sql`CASE WHEN ${recallDerivationState.canonicalInputVersion} = excluded.canonical_input_version THEN ${recallDerivationState.blocker} ELSE NULL END`,
        requiredDerivationVersion: sql`CASE WHEN ${recallDerivationState.canonicalInputVersion} = excluded.canonical_input_version THEN ${recallDerivationState.requiredDerivationVersion} ELSE NULL END`,
        updatedAt: new Date(),
      },
    })
    .returning({
      targetKind: recallDerivationState.targetKind,
      targetId: recallDerivationState.targetId,
      languageId: recallDerivationState.languageId,
      demandRevision: recallDerivationState.demandRevision,
    });
  return registered.map((reference) =>
    RecallDerivationReferenceSchema.parse(reference),
  );
};
