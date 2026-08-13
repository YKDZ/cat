import {
  and,
  eq,
  glossaryToProject,
  recallDerivationState,
  term,
  termConcept,
} from "@cat/db";
import {
  GlossaryConceptMaterializationSchema,
  type RecallDerivationReference,
} from "@cat/shared";
import * as z from "zod";

import { lockTermConceptRecallScopes } from "#/commands/recall-derivation/lock-term-concept-recall-scopes.ts";
import { registerTermConceptRecallDeletionDemands } from "#/commands/recall-derivation/register-term-concept-recall-derivation-demands.ts";
import { domainEvent } from "#/events/domain-events.ts";
import { inDatabaseTransaction } from "#/infrastructure/db-transaction.ts";
import { getGlossaryConceptMaterialization } from "#/queries/glossary/get-glossary-term-concept-snapshot.query.ts";
import type { Command } from "#/types.ts";

import { glossaryConceptMaterializationsEqual } from "./normalize-glossary-concept-materialization.ts";

export const DeleteGlossaryConceptCommandSchema = z.strictObject({
  conceptId: z.int().positive(),
  projectId: z.uuidv4().optional(),
  expectedBefore: GlossaryConceptMaterializationSchema.nullable().optional(),
});

export type DeleteGlossaryConceptResult = {
  deleted: boolean;
  glossaryId: string | null;
  termIds: number[];
  derivations: RecallDerivationReference[];
};

export const deleteGlossaryConcept: Command<
  z.infer<typeof DeleteGlossaryConceptCommandSchema>,
  DeleteGlossaryConceptResult
> = async (ctx, input) =>
  await inDatabaseTransaction(ctx.db, async (tx) => {
    await lockTermConceptRecallScopes(tx, [input.conceptId]);
    const [concept] = await tx
      .select({ id: termConcept.id, glossaryId: termConcept.glossaryId })
      .from(termConcept)
      .where(eq(termConcept.id, input.conceptId))
      .limit(1)
      .for("update");
    if (!concept) {
      return {
        result: {
          deleted: false,
          glossaryId: null,
          termIds: [],
          derivations: [],
        },
        events: [],
      };
    }
    if (input.expectedBefore !== undefined) {
      const actual = await getGlossaryConceptMaterialization(
        { db: tx },
        { conceptId: concept.id },
      );
      if (!glossaryConceptMaterializationsEqual(actual, input.expectedBefore)) {
        throw new TypeError(
          "Glossary concept optimistic concurrency conflict.",
        );
      }
    }
    if (input.projectId !== undefined) {
      const [link] = await tx
        .select({ glossaryId: glossaryToProject.glossaryId })
        .from(glossaryToProject)
        .where(
          and(
            eq(glossaryToProject.glossaryId, concept.glossaryId),
            eq(glossaryToProject.projectId, input.projectId),
          ),
        )
        .limit(1)
        .for("key share");
      if (!link) {
        throw new TypeError("Glossary is not linked to the requested project.");
      }
    }

    const terms = await tx
      .select({ id: term.id, languageId: term.languageId })
      .from(term)
      .where(eq(term.termConceptId, concept.id));
    const existingLanguages = await tx
      .select({ languageId: recallDerivationState.languageId })
      .from(recallDerivationState)
      .where(
        and(
          eq(recallDerivationState.targetKind, "TERM_CONCEPT"),
          eq(recallDerivationState.targetId, String(concept.id)),
        ),
      );
    await tx.delete(termConcept).where(eq(termConcept.id, concept.id));
    const derivations = await registerTermConceptRecallDeletionDemands(tx, [
      {
        conceptId: concept.id,
        glossaryId: concept.glossaryId,
        languageIds: [
          ...terms.map((entry) => entry.languageId),
          ...existingLanguages.map((entry) => entry.languageId),
        ],
      },
    ]);
    const termIds = terms.map((entry) => entry.id);
    return {
      result: {
        deleted: true,
        glossaryId: concept.glossaryId,
        termIds,
        derivations,
      },
      events:
        termIds.length === 0
          ? []
          : [
              domainEvent("term:deleted", {
                glossaryId: concept.glossaryId,
                termIds,
              }),
            ],
    };
  });
