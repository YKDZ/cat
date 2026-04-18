import { eq, termConceptToSubject } from "@cat/db";
import * as z from "zod";

import type { Query } from "@/types";

export const ListTermConceptIdsBySubjectQuerySchema = z.object({
  subjectId: z.int(),
});

export type ListTermConceptIdsBySubjectQuery = z.infer<
  typeof ListTermConceptIdsBySubjectQuerySchema
>;

export const listTermConceptIdsBySubject: Query<
  ListTermConceptIdsBySubjectQuery,
  number[]
> = async (ctx, query) => {
  const rows = await ctx.db
    .select({ termConceptId: termConceptToSubject.termConceptId })
    .from(termConceptToSubject)
    .where(eq(termConceptToSubject.subjectId, query.subjectId));

  return rows.map((row) => row.termConceptId);
};
