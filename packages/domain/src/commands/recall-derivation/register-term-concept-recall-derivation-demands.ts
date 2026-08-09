import { and, eq, inArray, recallDerivationState, sql } from "@cat/db";
import {
  computeTermConceptCanonicalInputVersion,
  computeTermConceptDeletionCanonicalInputVersion,
  type NormalizedLanguageId,
  NormalizedLanguageIdSchema,
  RecallDerivationReferenceSchema,
  type RecallDerivationReference,
} from "@cat/shared";

import { listTermConceptCanonicalSnapshots } from "#/queries/recall-derivation/get-term-concept-canonical-snapshots.query.ts";
import type { DbHandle } from "#/types.ts";

type TermConceptDemandRow = {
  targetKind: "TERM_CONCEPT";
  targetId: string;
  languageId: NormalizedLanguageId;
  canonicalInputVersion: Awaited<
    ReturnType<typeof computeTermConceptCanonicalInputVersion>
  >;
};

const upsertDemands = async (
  db: DbHandle,
  rows: readonly TermConceptDemandRow[],
): Promise<RecallDerivationReference[]> => {
  if (rows.length === 0) return [];
  const registered = await db
    .insert(recallDerivationState)
    .values([...rows])
    .onConflictDoUpdate({
      target: [
        recallDerivationState.targetKind,
        recallDerivationState.targetId,
        recallDerivationState.languageId,
      ],
      set: {
        canonicalInputVersion: sql`excluded.canonical_input_version`,
        demandRevision: sql`CASE WHEN ${recallDerivationState.canonicalInputVersion} = excluded.canonical_input_version THEN ${recallDerivationState.demandRevision} ELSE ${recallDerivationState.demandRevision} + 1 END`,
        taskProjectionRevision: sql`CASE WHEN ${recallDerivationState.canonicalInputVersion} = excluded.canonical_input_version THEN ${recallDerivationState.taskProjectionRevision} ELSE ${recallDerivationState.taskProjectionRevision} + 1 END`,
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

export const registerTermConceptRecallDerivationDemands = async (
  db: DbHandle,
  conceptIds: readonly number[],
): Promise<RecallDerivationReference[]> => {
  const snapshots = await listTermConceptCanonicalSnapshots({ db }, conceptIds);
  const existingStates =
    snapshots.length === 0
      ? []
      : await db
          .select({
            targetId: recallDerivationState.targetId,
            languageId: recallDerivationState.languageId,
          })
          .from(recallDerivationState)
          .where(
            and(
              eq(recallDerivationState.targetKind, "TERM_CONCEPT"),
              inArray(
                recallDerivationState.targetId,
                snapshots.map((snapshot) => String(snapshot.id)),
              ),
            ),
          );
  const rowsBySnapshot = await Promise.all(
    snapshots.map(async (snapshot) => {
      const targetId = String(snapshot.id);
      const languageIds = [
        ...new Set([
          ...snapshot.terms.map((entry) => entry.languageId),
          ...existingStates
            .filter((state) => state.targetId === targetId)
            .map((state) => NormalizedLanguageIdSchema.parse(state.languageId)),
        ]),
      ].sort();
      return await Promise.all(
        languageIds.map(async (languageId) => ({
          targetKind: "TERM_CONCEPT" as const,
          targetId,
          languageId,
          canonicalInputVersion: await computeTermConceptCanonicalInputVersion(
            snapshot,
            languageId,
          ),
        })),
      );
    }),
  );
  const rows = [
    ...new Map(
      rowsBySnapshot
        .flat()
        .map((row) => [`${row.targetId}\0${row.languageId}`, row]),
    ).values(),
  ];
  return await upsertDemands(db, rows);
};

export const registerTermConceptRecallDeletionDemands = async (
  db: DbHandle,
  targets: readonly {
    conceptId: number;
    glossaryId: string;
    languageIds: readonly string[];
  }[],
): Promise<RecallDerivationReference[]> => {
  const rows = (
    await Promise.all(
      targets.map(async (target) => {
        const languageIds = [
          ...new Set(
            target.languageIds.map((languageId) =>
              NormalizedLanguageIdSchema.parse(languageId),
            ),
          ),
        ].sort();
        if (languageIds.length === 0) return [];
        const canonicalInputVersion =
          await computeTermConceptDeletionCanonicalInputVersion({
            targetId: String(target.conceptId),
            glossaryId: target.glossaryId,
            languageIds,
          });
        return languageIds.map((languageId) => ({
          targetKind: "TERM_CONCEPT" as const,
          targetId: String(target.conceptId),
          languageId,
          canonicalInputVersion,
        }));
      }),
    )
  ).flat();
  return await upsertDemands(db, rows);
};
