import {
  and,
  asc,
  eq,
  inArray,
  recallDerivationState,
  sql,
  termConcept,
  glossaryToProject,
} from "@cat/db";
import {
  computeTermConceptCanonicalInputVersion,
  NormalizedLanguageIdSchema,
  RecallDerivationReferenceSchema,
} from "@cat/shared";
import * as z from "zod";

import { GlossaryProjectBindingError } from "#/commands/glossary/assert-project-glossary-binding.cmd.ts";
import { lockTermConceptRecallScopes } from "#/commands/recall-derivation/lock-term-concept-recall-scopes.ts";
import { createRecallDerivationTaskInTransaction } from "#/commands/recall-derivation/recall-derivation-task.cmd.ts";
import { listTermConceptCanonicalSnapshots } from "#/queries/recall-derivation/get-term-concept-canonical-snapshots.query.ts";
import type { Command } from "#/types.ts";

export const RequestGlossaryRecallRebuildCommandSchema = z.strictObject({
  glossaryId: z.uuidv4(),
  projectId: z.uuidv4(),
  actorId: z.uuidv4(),
});

export type RequestGlossaryRecallRebuildResult =
  | { status: "NO_WORK" }
  | { status: "STARTED"; taskId: string; total: number };

/**
 * A rebuild is intentionally non-idempotent: every request fences prior work
 * with a new demand revision and receives its own observer Task.
 */
export const requestGlossaryRecallRebuild: Command<
  z.infer<typeof RequestGlossaryRecallRebuildCommandSchema>,
  RequestGlossaryRecallRebuildResult
> = async (ctx, input) => {
  const command = RequestGlossaryRecallRebuildCommandSchema.parse(input);
  const result = await ctx.db.transaction(async (tx) => {
    const [binding] = await tx
      .select({ glossaryId: glossaryToProject.glossaryId })
      .from(glossaryToProject)
      .where(
        and(
          eq(glossaryToProject.glossaryId, command.glossaryId),
          eq(glossaryToProject.projectId, command.projectId),
        ),
      )
      .for("update");
    if (!binding) {
      throw new GlossaryProjectBindingError(
        command.glossaryId,
        command.projectId,
      );
    }

    // This is deliberately unlocked: concepts created after this read belong to
    // the next rebuild, while deleted candidates disappear in the locked reread.
    const candidateConceptIds = (
      await tx
        .select({ id: termConcept.id })
        .from(termConcept)
        .where(eq(termConcept.glossaryId, command.glossaryId))
        .orderBy(asc(termConcept.id))
    ).map((concept) => concept.id);
    if (candidateConceptIds.length === 0) return { status: "NO_WORK" } as const;

    await lockTermConceptRecallScopes(tx, candidateConceptIds);
    const concepts = await tx
      .select({ id: termConcept.id })
      .from(termConcept)
      .where(
        and(
          eq(termConcept.glossaryId, command.glossaryId),
          inArray(termConcept.id, candidateConceptIds),
        ),
      )
      .orderBy(asc(termConcept.id))
      .for("update");
    const conceptIds = concepts.map((concept) => concept.id);
    if (conceptIds.length === 0) return { status: "NO_WORK" } as const;
    const snapshots = await listTermConceptCanonicalSnapshots(
      { db: tx },
      conceptIds,
    );
    const existingStates = await tx
      .select({
        targetId: recallDerivationState.targetId,
        languageId: recallDerivationState.languageId,
      })
      .from(recallDerivationState)
      .where(
        and(
          eq(recallDerivationState.targetKind, "TERM_CONCEPT"),
          inArray(recallDerivationState.targetId, conceptIds.map(String)),
        ),
      )
      .orderBy(
        asc(recallDerivationState.targetId),
        asc(recallDerivationState.languageId),
      )
      .for("update");
    const rows = (
      await Promise.all(
        snapshots.map(async (snapshot) => {
          const targetId = String(snapshot.id);
          const languageIds = [
            ...new Set([
              ...snapshot.terms.map((entry) => entry.languageId),
              ...existingStates
                .filter((state) => state.targetId === targetId)
                .map((state) =>
                  NormalizedLanguageIdSchema.parse(state.languageId),
                ),
            ]),
          ].sort();
          return await Promise.all(
            languageIds.map(async (languageId) => ({
              targetKind: "TERM_CONCEPT" as const,
              targetId,
              languageId,
              canonicalInputVersion:
                await computeTermConceptCanonicalInputVersion(
                  snapshot,
                  languageId,
                ),
            })),
          );
        }),
      )
    ).flat();
    if (rows.length === 0) return { status: "NO_WORK" } as const;

    const references = (
      await tx
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
            demandRevision: sql`${recallDerivationState.demandRevision} + 1`,
            taskProjectionRevision: sql`${recallDerivationState.taskProjectionRevision} + 1`,
            status: "PENDING",
            leaseOwnerId: null,
            leaseToken: null,
            leaseExpiresAt: null,
            retryCount: 0,
            nextAttemptAt: null,
            blocker: null,
            requiredDerivationVersion: null,
            updatedAt: new Date(),
          },
        })
        .returning({
          targetKind: recallDerivationState.targetKind,
          targetId: recallDerivationState.targetId,
          languageId: recallDerivationState.languageId,
          demandRevision: recallDerivationState.demandRevision,
        })
    ).map((reference) => RecallDerivationReferenceSchema.parse(reference));
    const task = await createRecallDerivationTaskInTransaction(tx, {
      references,
      scope: { type: "PROJECT", id: command.projectId },
      actor: { type: "USER", id: command.actorId },
      resources: [
        { type: "PROJECT", id: command.projectId },
        { type: "GLOSSARY", id: command.glossaryId },
      ],
    });
    if (!task) throw new Error("Recall derivation task was not created.");
    return {
      status: "STARTED" as const,
      taskId: task.id,
      total: references.length,
    };
  });
  return { result, events: [] };
};
