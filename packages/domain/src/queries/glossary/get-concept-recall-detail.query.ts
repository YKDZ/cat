import {
  eq,
  term,
  termConcept,
  termConceptSubject,
  termConceptToSubject,
} from "@cat/db";
import * as z from "zod/v4";

import type { Query } from "@/types";

export const GetConceptRecallDetailQuerySchema = z.object({
  conceptId: z.int(),
});

export type GetConceptRecallDetailQuery = z.infer<
  typeof GetConceptRecallDetailQuerySchema
>;

export type ConceptTermEntry = {
  languageId: string;
  text: string;
};

export type ConceptRecallDetail = {
  conceptId: number;
  glossaryId: string;
  definition: string | null;
  subjectNames: string[];
  terms: ConceptTermEntry[];
};

/**
 * Fetch all data required to build recall variants for a single concept.
 *
 * This is a conceptId-only snapshot query: it does not filter by glossaryId
 * and does not require knowing the source / translation language in advance.
 * The caller (variant builder) is responsible for language filtering.
 */
export const getConceptRecallDetail: Query<
  GetConceptRecallDetailQuery,
  ConceptRecallDetail | null
> = async (ctx, query) => {
  // 1. Fetch concept base info
  const conceptRows = await ctx.db
    .select({
      id: termConcept.id,
      glossaryId: termConcept.glossaryId,
      definition: termConcept.definition,
    })
    .from(termConcept)
    .where(eq(termConcept.id, query.conceptId))
    .limit(1);

  if (conceptRows.length === 0 || !conceptRows[0]) return null;
  const concept = conceptRows[0];

  // 2. Fetch all terms (all languages)
  const termRows = await ctx.db
    .select({ languageId: term.languageId, text: term.text })
    .from(term)
    .where(eq(term.termConceptId, query.conceptId));

  // 3. Fetch subject names
  const subjectRows = await ctx.db
    .select({ subject: termConceptSubject.subject })
    .from(termConceptToSubject)
    .innerJoin(
      termConceptSubject,
      eq(termConceptToSubject.subjectId, termConceptSubject.id),
    )
    .where(eq(termConceptToSubject.termConceptId, query.conceptId));

  return {
    conceptId: concept.id,
    glossaryId: concept.glossaryId,
    definition: concept.definition,
    subjectNames: subjectRows.map((r) => r.subject),
    terms: termRows,
  };
};
