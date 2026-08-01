import {
  and,
  eq,
  languageAnalysisPolicy,
  languageAnalysisSelection,
} from "@cat/db";
import {
  LanguageAnalysisSelectionFingerprintSchema,
  LanguageAnalysisSelectionSchema,
  LanguageAnalysisSelectionWriteSchema,
  type LanguageAnalysisSelection,
} from "@cat/shared";
import * as z from "zod";

import type { Command, DbHandle } from "#/types.ts";

const DEPLOYMENT_POLICY_ID = 1;

type TxCapableDb = DbHandle & {
  transaction: <T>(fn: (tx: DbHandle) => Promise<T>) => Promise<T>;
};

/** A write has lost its optimistic race or was based on an obsolete revision. */
export class LanguageAnalysisSelectionConflictError extends Error {
  public constructor() {
    super("Language Analysis selection revision conflict.");
    this.name = "LanguageAnalysisSelectionConflictError";
  }
}

// The host computes this snapshot after it has validated the selected analyzer.
export const WriteValidatedLanguageAnalysisSelectionCommandSchema =
  LanguageAnalysisSelectionWriteSchema.extend({
    configurationFingerprint:
      LanguageAnalysisSelectionFingerprintSchema.nullable(),
  }).superRefine((value, ctx) => {
    if (
      (value.implementation === null) !==
      (value.configurationFingerprint === null)
    ) {
      ctx.addIssue({
        code: "custom",
        message:
          "Language Analysis selection fingerprints exist exactly for an implementation.",
      });
    }
  });

export type WriteValidatedLanguageAnalysisSelectionCommand = z.infer<
  typeof WriteValidatedLanguageAnalysisSelectionCommandSchema
>;

export const writeValidatedLanguageAnalysisSelection: Command<
  WriteValidatedLanguageAnalysisSelectionCommand,
  LanguageAnalysisSelection
> = async (ctx, command) => {
  const persist = async (tx: DbHandle): Promise<LanguageAnalysisSelection> => {
    const nextRevision = command.expectedRevision + 1;
    const now = new Date();
    await tx
      .insert(languageAnalysisPolicy)
      .values({
        id: DEPLOYMENT_POLICY_ID,
        epoch: 0,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing();
    const [policy] = await tx
      .select({ epoch: languageAnalysisPolicy.epoch })
      .from(languageAnalysisPolicy)
      .where(eq(languageAnalysisPolicy.id, DEPLOYMENT_POLICY_ID))
      .limit(1)
      .for("update");
    if (policy === undefined) {
      throw new Error("Failed to lock the Language Analysis policy epoch.");
    }

    const record =
      command.expectedRevision === 0
        ? (
            await tx
              .insert(languageAnalysisSelection)
              .values({
                key: command.key,
                implementation: command.implementation,
                revision: nextRevision,
                configurationFingerprint: command.configurationFingerprint,
                createdAt: now,
                updatedAt: now,
              })
              .onConflictDoNothing()
              .returning()
          )[0]
        : (
            await tx
              .update(languageAnalysisSelection)
              .set({
                implementation: command.implementation,
                revision: nextRevision,
                configurationFingerprint: command.configurationFingerprint,
                updatedAt: now,
              })
              .where(
                and(
                  eq(languageAnalysisSelection.key, command.key),
                  eq(
                    languageAnalysisSelection.revision,
                    command.expectedRevision,
                  ),
                ),
              )
              .returning()
          )[0];
    if (record === undefined)
      throw new LanguageAnalysisSelectionConflictError();

    await tx
      .update(languageAnalysisPolicy)
      .set({ epoch: policy.epoch + 1, updatedAt: now })
      .where(eq(languageAnalysisPolicy.id, DEPLOYMENT_POLICY_ID));

    return LanguageAnalysisSelectionSchema.parse({
      key: record.key,
      implementation: record.implementation,
      revision: record.revision,
      configurationFingerprint: record.configurationFingerprint,
      updatedAt: record.updatedAt,
    });
  };

  const txCandidate = ctx.db as Partial<TxCapableDb>;
  if (typeof txCandidate.transaction !== "function") {
    throw new Error(
      "Language Analysis policy writes require a transaction-capable database handle.",
    );
  }
  const result = await txCandidate.transaction(persist);
  return { events: [], result };
};
