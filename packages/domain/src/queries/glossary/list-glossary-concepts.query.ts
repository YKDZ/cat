import {
  count,
  eq,
  getColumns,
  term,
  termConcept,
  termConceptSubject,
  termConceptToSubject,
} from "@cat/db";
import * as z from "zod/v4";

import type { Query } from "@/types";

export const ListGlossaryConceptsQuerySchema = z.object({
  glossaryId: z.uuidv4(),
  pageIndex: z.int().min(0),
  pageSize: z.int().min(1),
});

export type ListGlossaryConceptsQuery = z.infer<
  typeof ListGlossaryConceptsQuerySchema
>;

export type GlossaryConceptData = typeof termConcept.$inferSelect & {
  subjects: Array<{ subject: string; defaultDefinition: string | null }>;
  termCount: number;
  sampleTerms: Array<{
    id: number;
    text: string;
    languageId: string;
    type: string;
    status: string;
  }>;
};

export type ListGlossaryConceptsResult = {
  data: GlossaryConceptData[];
  total: number;
};

export const listGlossaryConcepts: Query<
  ListGlossaryConceptsQuery,
  ListGlossaryConceptsResult
> = async (ctx, query) => {
  const totalResult = await ctx.db
    .select({ count: count() })
    .from(termConcept)
    .where(eq(termConcept.glossaryId, query.glossaryId));

  const concepts = await ctx.db
    .select(getColumns(termConcept))
    .from(termConcept)
    .where(eq(termConcept.glossaryId, query.glossaryId))
    .limit(query.pageSize)
    .offset(query.pageIndex * query.pageSize);

  const data = await Promise.all(
    concepts.map(async (concept) => {
      const [subjects, termCountResult, sampleTerms] = await Promise.all([
        ctx.db
          .select({
            subject: termConceptSubject.subject,
            defaultDefinition: termConceptSubject.defaultDefinition,
          })
          .from(termConceptToSubject)
          .innerJoin(
            termConceptSubject,
            eq(termConceptToSubject.subjectId, termConceptSubject.id),
          )
          .where(eq(termConceptToSubject.termConceptId, concept.id)),
        ctx.db
          .select({ count: count() })
          .from(term)
          .where(eq(term.termConceptId, concept.id)),
        ctx.db
          .select({
            id: term.id,
            text: term.text,
            languageId: term.languageId,
            type: term.type,
            status: term.status,
          })
          .from(term)
          .where(eq(term.termConceptId, concept.id))
          .limit(3),
      ]);

      return {
        ...concept,
        subjects,
        termCount: Number(termCountResult[0]?.count ?? 0),
        sampleTerms,
      };
    }),
  );

  return {
    data,
    total: Number(totalResult[0]?.count ?? 0),
  };
};
