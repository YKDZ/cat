import { eq, term, termConcept } from "@cat/db";
import { isNotNull } from "@cat/db";
import * as z from "zod";

import type { Query } from "@/types";

export const ListAllTermsQuerySchema = z.object({});

export type ListAllTermsQuery = z.infer<typeof ListAllTermsQuerySchema>;

export type TermWithConcept = {
  term: typeof term.$inferSelect;
  concept: typeof termConcept.$inferSelect | null;
};

export const listAllTerms: Query<ListAllTermsQuery, TermWithConcept[]> = async (
  ctx,
  _query,
) => {
  const rows = await ctx.db
    .select({
      term,
      concept: termConcept,
    })
    .from(term)
    .leftJoin(termConcept, eq(term.termConceptId, termConcept.id))
    .where(isNotNull(termConcept.definition));

  return rows.map((row) => ({
    term: row.term,
    concept: row.concept,
  }));
};
