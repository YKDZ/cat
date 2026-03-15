import { eq, inArray, termConceptSubject, termConceptToSubject } from "@cat/db";
import * as z from "zod/v4";

import type { Query } from "@/types";

export const ListConceptSubjectsByConceptIdsQuerySchema = z.object({
  conceptIds: z.array(z.int()),
});

export type ListConceptSubjectsByConceptIdsQuery = z.infer<
  typeof ListConceptSubjectsByConceptIdsQuerySchema
>;

export type ConceptSubjectRow = {
  conceptId: number;
  name: string;
  defaultDefinition: string | null;
};

export const listConceptSubjectsByConceptIds: Query<
  ListConceptSubjectsByConceptIdsQuery,
  ConceptSubjectRow[]
> = async (ctx, query) => {
  if (query.conceptIds.length === 0) {
    return [];
  }

  return ctx.db
    .select({
      conceptId: termConceptToSubject.termConceptId,
      name: termConceptSubject.subject,
      defaultDefinition: termConceptSubject.defaultDefinition,
    })
    .from(termConceptToSubject)
    .innerJoin(
      termConceptSubject,
      eq(termConceptSubject.id, termConceptToSubject.subjectId),
    )
    .where(inArray(termConceptToSubject.termConceptId, query.conceptIds));
};
