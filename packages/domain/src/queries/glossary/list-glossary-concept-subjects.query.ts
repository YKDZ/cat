import { eq, termConceptSubject } from "@cat/db";
import * as z from "zod";

import type { Query } from "@/types";

export const ListGlossaryConceptSubjectsQuerySchema = z.object({
  glossaryId: z.uuidv4(),
});

export type ListGlossaryConceptSubjectsQuery = z.infer<
  typeof ListGlossaryConceptSubjectsQuerySchema
>;

export type GlossaryConceptSubject = {
  id: number;
  subject: string;
};

export const listGlossaryConceptSubjects: Query<
  ListGlossaryConceptSubjectsQuery,
  GlossaryConceptSubject[]
> = async (ctx, query) => {
  return ctx.db
    .select({
      id: termConceptSubject.id,
      subject: termConceptSubject.subject,
    })
    .from(termConceptSubject)
    .where(eq(termConceptSubject.glossaryId, query.glossaryId))
    .orderBy(termConceptSubject.subject);
};
