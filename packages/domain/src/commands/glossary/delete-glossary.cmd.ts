import {
  and,
  asc,
  eq,
  glossary,
  inArray,
  recallDerivationState,
  sql,
  term,
  termConcept,
} from "@cat/db";
import type { RecallDerivationReference } from "@cat/shared";
import * as z from "zod";

import { lockTermConceptRecallScopes } from "#/commands/recall-derivation/lock-term-concept-recall-scopes.ts";
import { registerTermConceptRecallDeletionDemands } from "#/commands/recall-derivation/register-term-concept-recall-derivation-demands.ts";
import { inDatabaseTransaction } from "#/infrastructure/db-transaction.ts";
import type { Command } from "#/types.ts";

export const DeleteGlossaryCommandSchema = z.strictObject({
  glossaryId: z.uuidv4(),
});

export type DeleteGlossaryResult = {
  deleted: boolean;
  conceptIds: number[];
  termIds: number[];
  derivations: RecallDerivationReference[];
};

export const deleteGlossary: Command<
  z.infer<typeof DeleteGlossaryCommandSchema>,
  DeleteGlossaryResult
> = async (ctx, input) => {
  const result = await inDatabaseTransaction(ctx.db, async (tx) => {
    const [target] = await tx
      .select({ id: glossary.id })
      .from(glossary)
      .where(eq(glossary.id, input.glossaryId))
      .limit(1)
      .for("update");
    if (!target) {
      return {
        deleted: false,
        conceptIds: [],
        termIds: [],
        derivations: [],
      };
    }
    const concepts = await tx
      .select({ id: termConcept.id })
      .from(termConcept)
      .where(eq(termConcept.glossaryId, input.glossaryId))
      .orderBy(asc(termConcept.id));
    const conceptIds = concepts.map((entry) => entry.id);
    await lockTermConceptRecallScopes(tx, conceptIds);
    await tx.execute(
      sql`LOCK TABLE ${termConcept}, ${term} IN SHARE ROW EXCLUSIVE MODE`,
    );
    const terms =
      conceptIds.length === 0
        ? []
        : await tx
            .select({
              id: term.id,
              conceptId: term.termConceptId,
              languageId: term.languageId,
            })
            .from(term)
            .where(inArray(term.termConceptId, conceptIds));
    const states =
      conceptIds.length === 0
        ? []
        : await tx
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
            );
    await tx.delete(glossary).where(eq(glossary.id, input.glossaryId));
    const derivations = await registerTermConceptRecallDeletionDemands(
      tx,
      conceptIds.map((conceptId) => ({
        conceptId,
        glossaryId: input.glossaryId,
        languageIds: [
          ...terms
            .filter((entry) => entry.conceptId === conceptId)
            .map((entry) => entry.languageId),
          ...states
            .filter((entry) => entry.targetId === String(conceptId))
            .map((entry) => entry.languageId),
        ],
      })),
    );
    return {
      deleted: true,
      conceptIds,
      termIds: terms.map((entry) => entry.id),
      derivations,
    };
  });
  return { result, events: [] };
};
