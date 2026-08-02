import {
  eq,
  inArray,
  term,
  termConcept,
  termConceptSubject,
  termConceptToSubject,
} from "@cat/db";
import {
  compareCodeUnitStrings,
  TermConceptCanonicalSnapshotSchema,
  type TermConceptCanonicalSnapshot,
} from "@cat/shared";
import * as z from "zod";

import type { DbContext, Query } from "#/types.ts";

export const GetTermConceptCanonicalSnapshotsQuerySchema = z.strictObject({
  conceptIds: z.array(z.int().positive()),
});

export const listTermConceptCanonicalSnapshots = async (
  ctx: DbContext,
  conceptIds: readonly number[],
): Promise<TermConceptCanonicalSnapshot[]> => {
  if (conceptIds.length === 0) return [];
  const uniqueConceptIds = [...new Set(conceptIds)];
  const concepts = await ctx.db
    .select({
      id: termConcept.id,
      glossaryId: termConcept.glossaryId,
      creatorId: termConcept.creatorId,
      definition: termConcept.definition,
    })
    .from(termConcept)
    .where(inArray(termConcept.id, uniqueConceptIds));
  const terms = await ctx.db
    .select({
      id: term.id,
      conceptId: term.termConceptId,
      creatorId: term.creatorId,
      text: term.text,
      languageId: term.languageId,
      type: term.type,
      status: term.status,
    })
    .from(term)
    .where(inArray(term.termConceptId, uniqueConceptIds));
  const subjects = await ctx.db
    .select({
      conceptId: termConceptToSubject.termConceptId,
      id: termConceptSubject.id,
      creatorId: termConceptSubject.creatorId,
      subject: termConceptSubject.subject,
      defaultDefinition: termConceptSubject.defaultDefinition,
      isPrimary: termConceptToSubject.isPrimary,
    })
    .from(termConceptToSubject)
    .innerJoin(
      termConceptSubject,
      eq(termConceptSubject.id, termConceptToSubject.subjectId),
    )
    .where(inArray(termConceptToSubject.termConceptId, uniqueConceptIds));

  return concepts.map((concept) =>
    TermConceptCanonicalSnapshotSchema.parse({
      ...concept,
      terms: terms
        .filter((entry) => entry.conceptId === concept.id)
        .map(({ conceptId: _conceptId, ...entry }) => entry)
        .sort(
          (left, right) =>
            left.id - right.id ||
            compareCodeUnitStrings(left.text, right.text) ||
            compareCodeUnitStrings(left.languageId, right.languageId) ||
            compareCodeUnitStrings(left.type, right.type) ||
            compareCodeUnitStrings(left.status, right.status),
        ),
      subjects: subjects
        .filter((entry) => entry.conceptId === concept.id)
        .map(({ conceptId: _conceptId, ...entry }) => entry)
        .sort(
          (left, right) =>
            left.id - right.id ||
            compareCodeUnitStrings(left.subject, right.subject) ||
            compareCodeUnitStrings(
              left.defaultDefinition ?? "",
              right.defaultDefinition ?? "",
            ) ||
            Number(left.isPrimary) - Number(right.isPrimary),
        ),
    }),
  );
};

export const getTermConceptCanonicalSnapshots: Query<
  z.infer<typeof GetTermConceptCanonicalSnapshotsQuerySchema>,
  TermConceptCanonicalSnapshot[]
> = async (ctx, input) =>
  await listTermConceptCanonicalSnapshots(ctx, input.conceptIds);
