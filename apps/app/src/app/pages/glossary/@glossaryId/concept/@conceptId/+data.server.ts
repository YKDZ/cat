import type { PageContextServer } from "vike/types";

import {
  and,
  eq,
  getColumns,
  getDrizzleDB,
  term as termTable,
  termConcept,
  termConceptSubject,
  termConceptToSubject,
} from "@cat/db";
import { assertSingleNonNullish } from "@cat/shared/utils";
import { redirect } from "vike/abort";

export const data = async (ctx: PageContextServer) => {
  const { client: drizzle } = await getDrizzleDB();
  const { glossaryId, conceptId } = ctx.routeParams;

  if (!glossaryId || !conceptId) {
    throw redirect(`/glossary/${glossaryId}`);
  }

  return await drizzle.transaction(async (tx) => {
    const parsedConceptId = Number(conceptId);
    if (!Number.isFinite(parsedConceptId)) {
      throw redirect(`/glossary/${glossaryId}`);
    }

    // Fetch concept (without subject — subjects are M:N now)
    const concept = assertSingleNonNullish(
      await tx
        .select(getColumns(termConcept))
        .from(termConcept)
        .where(
          and(
            eq(termConcept.glossaryId, glossaryId),
            eq(termConcept.id, parsedConceptId),
          ),
        ),
    );

    // Fetch M:N subjects via junction table
    const subjects = await tx
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
      .where(eq(termConceptToSubject.termConceptId, concept.id));

    // Terms now store text + languageId directly
    const terms = await tx
      .select(getColumns(termTable))
      .from(termTable)
      .where(eq(termTable.termConceptId, concept.id));

    const availableSubjects = await tx
      .select({
        id: termConceptSubject.id,
        subject: termConceptSubject.subject,
      })
      .from(termConceptSubject)
      .where(eq(termConceptSubject.glossaryId, glossaryId))
      .orderBy(termConceptSubject.subject);

    return {
      concept,
      subjects,
      terms,
      availableSubjects,
    };
  });
};

export type Data = Awaited<ReturnType<typeof data>>;
