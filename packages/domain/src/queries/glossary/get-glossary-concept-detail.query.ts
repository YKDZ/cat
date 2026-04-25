import {
  and,
  eq,
  getColumns,
  term,
  termConcept,
  termConceptSubject,
  termConceptToSubject,
} from "@cat/db";
import { assertSingleOrNull } from "@cat/shared";
import * as z from "zod";

import type { Query } from "@/types";

export const GetGlossaryConceptDetailQuerySchema = z.object({
  glossaryId: z.uuidv4(),
  conceptId: z.int(),
});

export type GetGlossaryConceptDetailQuery = z.infer<
  typeof GetGlossaryConceptDetailQuerySchema
>;

export type GlossaryConceptDetail = {
  concept: typeof termConcept.$inferSelect;
  subjects: Array<{
    id: number;
    subject: string;
    defaultDefinition: string | null;
    isPrimary: boolean;
  }>;
  terms: Array<typeof term.$inferSelect>;
  availableSubjects: Array<{
    id: number;
    subject: string;
  }>;
};

export const getGlossaryConceptDetail: Query<
  GetGlossaryConceptDetailQuery,
  GlossaryConceptDetail | null
> = async (ctx, query) => {
  const concept = assertSingleOrNull(
    await ctx.db
      .select(getColumns(termConcept))
      .from(termConcept)
      .where(
        and(
          eq(termConcept.glossaryId, query.glossaryId),
          eq(termConcept.id, query.conceptId),
        ),
      )
      .limit(1),
  );

  if (concept === null) {
    return null;
  }

  const [subjects, terms, availableSubjects] = await Promise.all([
    ctx.db
      .select({
        id: termConceptSubject.id,
        subject: termConceptSubject.subject,
        defaultDefinition: termConceptSubject.defaultDefinition,
        isPrimary: termConceptToSubject.isPrimary,
      })
      .from(termConceptToSubject)
      .innerJoin(
        termConceptSubject,
        eq(termConceptToSubject.subjectId, termConceptSubject.id),
      )
      .where(eq(termConceptToSubject.termConceptId, concept.id)),
    ctx.db
      .select(getColumns(term))
      .from(term)
      .where(eq(term.termConceptId, concept.id)),
    ctx.db
      .select({
        id: termConceptSubject.id,
        subject: termConceptSubject.subject,
      })
      .from(termConceptSubject)
      .where(eq(termConceptSubject.glossaryId, query.glossaryId))
      .orderBy(termConceptSubject.subject),
  ]);

  return {
    concept,
    subjects,
    terms,
    availableSubjects,
  };
};
