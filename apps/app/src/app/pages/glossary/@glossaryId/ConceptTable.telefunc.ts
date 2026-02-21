import {
  eq,
  getColumns,
  getDrizzleDB,
  termConcept,
  termConceptSubject,
} from "@cat/db";
import type { TermConcept } from "@cat/shared/schema/drizzle/glossary";

export type ConceptData = TermConcept & { subject: string };

export const onRequestConcept = async (
  glossaryId: string,
  pageIndex: number,
  pageSize: number,
): Promise<ConceptData[]> => {
  const { client: drizzle } = await getDrizzleDB();

  return await drizzle
    .select({ ...getColumns(termConcept), subject: termConceptSubject.subject })
    .from(termConcept)
    .where(eq(termConcept.glossaryId, glossaryId))
    .innerJoin(
      termConceptSubject,
      eq(termConcept.subjectId, termConceptSubject.id),
    )
    .limit(pageSize)
    .offset(pageIndex * pageSize);
};
