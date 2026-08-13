import {
  and,
  asc,
  eq,
  glossary,
  glossaryToProject,
  inArray,
  isNull,
  or,
  sql,
  term,
  termConcept,
  termConceptSubject,
  termConceptToSubject,
} from "@cat/db";
import {
  GlossaryConceptMaterializationSchema,
  type RecallDerivationReference,
} from "@cat/shared";
import * as z from "zod";

import { lockTermConceptRecallScopes } from "#/commands/recall-derivation/lock-term-concept-recall-scopes.ts";
import { registerTermConceptRecallDerivationDemands } from "#/commands/recall-derivation/register-term-concept-recall-derivation-demands.ts";
import { domainEvent } from "#/events/domain-events.ts";
import { inDatabaseTransaction } from "#/infrastructure/db-transaction.ts";
import { getGlossaryConceptMaterialization } from "#/queries/glossary/get-glossary-term-concept-snapshot.query.ts";
import type { Command } from "#/types.ts";

import { glossaryConceptMaterializationsEqual } from "./normalize-glossary-concept-materialization.ts";

export const MaterializeGlossaryConceptCommandSchema =
  GlossaryConceptMaterializationSchema.extend({
    projectId: z.uuidv4().optional(),
    expectedBefore: GlossaryConceptMaterializationSchema.nullable().optional(),
  }).superRefine((input, ctx) => {
    const seenTermIds = new Set<number>();
    for (const [index, entry] of input.terms.entries()) {
      if (entry.termConceptId !== input.concept.id) {
        ctx.addIssue({
          code: "custom",
          message: "Term identity does not belong to the materialized concept.",
          path: ["terms", index, "termConceptId"],
        });
      }
      if (seenTermIds.has(entry.id)) {
        ctx.addIssue({
          code: "custom",
          message: "Term IDs must be unique within a concept snapshot.",
          path: ["terms", index, "id"],
        });
      }
      seenTermIds.add(entry.id);
    }
    const subjectIds = input.subjects.map((entry) => entry.subjectId);
    if (new Set(subjectIds).size !== subjectIds.length) {
      ctx.addIssue({
        code: "custom",
        message: "Subject IDs must be unique within a concept snapshot.",
        path: ["subjects"],
      });
    }
  });

export type MaterializeGlossaryConceptResult = {
  conceptId: number;
  glossaryId: string;
  termIds: number[];
  derivations: RecallDerivationReference[];
};

const advanceGlossarySequences = async (
  db: Parameters<typeof lockTermConceptRecallScopes>[0],
): Promise<void> => {
  await db.execute(sql`
    WITH sequence_refs AS (
      SELECT
        pg_get_serial_sequence(
          format('%I.%I', current_schema(), 'TermConcept'),
          'id'
        )::regclass AS concept_sequence_id,
        pg_get_serial_sequence(
          format('%I.%I', current_schema(), 'Term'),
          'id'
        )::regclass AS term_sequence_id
    )
    SELECT
      setval(
        concept_sequence_id,
        GREATEST(
          COALESCE((SELECT max(${termConcept.id}) FROM ${termConcept}), 1),
          COALESCE(pg_sequence_last_value(concept_sequence_id), 1)
        ),
        true
      ),
      setval(
        term_sequence_id,
        GREATEST(
          COALESCE((SELECT max(${term.id}) FROM ${term}), 1),
          COALESCE(pg_sequence_last_value(term_sequence_id), 1)
        ),
        true
      )
    FROM sequence_refs
  `);
};

export const materializeGlossaryConcept: Command<
  z.input<typeof MaterializeGlossaryConceptCommandSchema>,
  MaterializeGlossaryConceptResult
> = async (ctx, input) => {
  const snapshot = MaterializeGlossaryConceptCommandSchema.parse(input);
  const result = await inDatabaseTransaction(ctx.db, async (tx) => {
    const conceptId = snapshot.concept.id;
    const [targetGlossary] = await tx
      .select({ id: glossary.id })
      .from(glossary)
      .where(eq(glossary.id, snapshot.concept.glossaryId))
      .limit(1)
      .for("key share");
    if (!targetGlossary) {
      throw new TypeError(
        `Glossary ${snapshot.concept.glossaryId} does not exist.`,
      );
    }
    if (snapshot.projectId !== undefined) {
      const [link] = await tx
        .select({ glossaryId: glossaryToProject.glossaryId })
        .from(glossaryToProject)
        .where(
          and(
            eq(glossaryToProject.glossaryId, snapshot.concept.glossaryId),
            eq(glossaryToProject.projectId, snapshot.projectId),
          ),
        )
        .limit(1)
        .for("key share");
      if (!link) {
        throw new TypeError("Glossary is not linked to the requested project.");
      }
    }
    await lockTermConceptRecallScopes(tx, [conceptId]);
    await tx.execute(
      sql`LOCK TABLE ${termConcept}, ${term} IN SHARE ROW EXCLUSIVE MODE`,
    );

    const [existingConcept] = await tx
      .select({ id: termConcept.id, glossaryId: termConcept.glossaryId })
      .from(termConcept)
      .where(eq(termConcept.id, conceptId))
      .limit(1)
      .for("update");
    if (snapshot.expectedBefore !== undefined) {
      const actual = existingConcept
        ? await getGlossaryConceptMaterialization({ db: tx }, { conceptId })
        : null;
      if (
        !glossaryConceptMaterializationsEqual(actual, snapshot.expectedBefore)
      ) {
        throw new TypeError(
          "Glossary concept optimistic concurrency conflict.",
        );
      }
    }
    if (
      existingConcept &&
      existingConcept.glossaryId !== snapshot.concept.glossaryId
    ) {
      throw new TypeError(
        `Term Concept ${conceptId} belongs to a different Glossary.`,
      );
    }

    const termIds = snapshot.terms.map((entry) => entry.id);
    const collidingTerms =
      termIds.length === 0
        ? []
        : await tx
            .select({ id: term.id, termConceptId: term.termConceptId })
            .from(term)
            .where(inArray(term.id, termIds))
            .orderBy(asc(term.id))
            .for("update");
    const identityCollision = collidingTerms.find(
      (entry) => entry.termConceptId !== conceptId,
    );
    if (identityCollision) {
      throw new TypeError(
        `Term ${identityCollision.id} belongs to a different Term Concept.`,
      );
    }

    const subjectIds = snapshot.subjects.map((entry) => entry.subjectId);
    if (subjectIds.length > 0) {
      const validSubjects = await tx
        .select({ id: termConceptSubject.id })
        .from(termConceptSubject)
        .where(
          and(
            inArray(termConceptSubject.id, subjectIds),
            or(
              eq(termConceptSubject.glossaryId, snapshot.concept.glossaryId),
              isNull(termConceptSubject.glossaryId),
            ),
          ),
        );
      if (validSubjects.length !== subjectIds.length) {
        throw new TypeError(
          "Concept snapshot references an unavailable Glossary subject.",
        );
      }
    }

    if (existingConcept) {
      await tx
        .update(termConcept)
        .set({
          creatorId: snapshot.concept.creatorId,
          definition: snapshot.concept.definition,
          updatedAt: new Date(),
        })
        .where(eq(termConcept.id, conceptId));
    } else {
      await tx.insert(termConcept).values(snapshot.concept);
    }
    await tx.delete(term).where(eq(term.termConceptId, conceptId));
    if (snapshot.terms.length > 0) {
      await tx.insert(term).values(snapshot.terms);
    }
    await tx
      .delete(termConceptToSubject)
      .where(eq(termConceptToSubject.termConceptId, conceptId));
    if (snapshot.subjects.length > 0) {
      await tx.insert(termConceptToSubject).values(
        snapshot.subjects.map((entry) => ({
          termConceptId: conceptId,
          subjectId: entry.subjectId,
          isPrimary: entry.isPrimary,
        })),
      );
    }
    await advanceGlossarySequences(tx);
    const derivations = await registerTermConceptRecallDerivationDemands(tx, [
      conceptId,
    ]);
    return {
      conceptId,
      glossaryId: snapshot.concept.glossaryId,
      termIds,
      derivations,
    };
  });
  return {
    result,
    events: [
      domainEvent("term:updated", {
        glossaryId: result.glossaryId,
        termIds: result.termIds,
      }),
      domainEvent("concept:updated", { conceptId: result.conceptId }),
    ],
  };
};
