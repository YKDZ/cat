import {
  and,
  eq,
  languageAnalysisObservation,
  languageAnalysisPolicy,
  languageAnalysisSelection,
} from "@cat/db";
import {
  LanguageAnalysisObservationSchema,
  type LanguageAnalysisObservation,
} from "@cat/shared";

import type { Command, DbHandle } from "#/types.ts";

type TxCapableDb = DbHandle & {
  transaction: <T>(fn: (tx: DbHandle) => Promise<T>) => Promise<T>;
};

/** An observation must never replace a result for a newer policy snapshot. */
export class StaleLanguageAnalysisObservationError extends Error {
  public constructor() {
    super(
      "Language Analysis observation does not match the current selection.",
    );
    this.name = "StaleLanguageAnalysisObservationError";
  }
}

export const writeLanguageAnalysisObservation: Command<
  LanguageAnalysisObservation,
  LanguageAnalysisObservation
> = async (ctx, observation) => {
  const persist = async (
    tx: DbHandle,
  ): Promise<LanguageAnalysisObservation> => {
    const now = new Date();
    await tx
      .insert(languageAnalysisPolicy)
      .values({ id: 1, epoch: 0, createdAt: now, updatedAt: now })
      .onConflictDoNothing();
    const [policy] = await tx
      .select({ epoch: languageAnalysisPolicy.epoch })
      .from(languageAnalysisPolicy)
      .where(eq(languageAnalysisPolicy.id, 1))
      .limit(1)
      .for("update");
    if (policy?.epoch !== observation.policyEpoch) {
      throw new StaleLanguageAnalysisObservationError();
    }

    const current = await tx
      .select({ key: languageAnalysisSelection.key })
      .from(languageAnalysisSelection)
      .where(
        and(
          eq(languageAnalysisSelection.key, observation.selectionKey),
          eq(languageAnalysisSelection.revision, observation.selectionRevision),
          eq(
            languageAnalysisSelection.configurationFingerprint,
            observation.configurationFingerprint,
          ),
        ),
      )
      .limit(1)
      .for("update");
    if (current.length !== 1) throw new StaleLanguageAnalysisObservationError();

    const [record] = await tx
      .insert(languageAnalysisObservation)
      .values({ ...observation, createdAt: now, updatedAt: now })
      .onConflictDoUpdate({
        target: languageAnalysisObservation.languageId,
        set: {
          policyEpoch: observation.policyEpoch,
          selectionKey: observation.selectionKey,
          selectionRevision: observation.selectionRevision,
          configurationFingerprint: observation.configurationFingerprint,
          assessment: observation.assessment,
          observedAt: observation.observedAt,
          updatedAt: now,
        },
      })
      .returning();
    if (record === undefined) {
      throw new Error("Failed to persist Language Analysis observation.");
    }
    return LanguageAnalysisObservationSchema.parse({
      languageId: record.languageId,
      policyEpoch: record.policyEpoch,
      selectionKey: record.selectionKey,
      selectionRevision: record.selectionRevision,
      configurationFingerprint: record.configurationFingerprint,
      assessment: record.assessment,
      observedAt: record.observedAt,
    });
  };
  const txCandidate = ctx.db as Partial<TxCapableDb>;
  if (typeof txCandidate.transaction !== "function") {
    throw new Error(
      "Language Analysis observation writes require a transaction-capable database handle.",
    );
  }
  const result = await txCandidate.transaction(persist);
  return { events: [], result };
};
