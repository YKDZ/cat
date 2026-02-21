import {
  eq,
  getColumns,
  getDrizzleDB,
  term as termTable,
  termConcept,
  termConceptSubject,
  translatableString,
  and,
} from "@cat/db";
import { assertSingleNonNullish } from "@cat/shared/utils";
import { redirect } from "vike/abort";
import type { PageContextServer } from "vike/types";

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

    const concept = assertSingleNonNullish(
      await tx
        .select({
          ...getColumns(termConcept),
          subject: termConceptSubject.subject,
        })
        .from(termConcept)
        .where(
          and(
            eq(termConcept.glossaryId, glossaryId),
            eq(termConcept.id, parsedConceptId),
          ),
        )
        .leftJoin(
          termConceptSubject,
          eq(termConcept.subjectId, termConceptSubject.id),
        ),
    );

    const terms = await tx
      .select({
        ...getColumns(termTable),
        languageId: translatableString.languageId,
        text: translatableString.value,
      })
      .from(termTable)
      .where(eq(termTable.termConceptId, concept.id))
      .innerJoin(
        translatableString,
        eq(termTable.stringId, translatableString.id),
      );

    return {
      concept,
      terms,
    };
  });
};

export type Data = Awaited<ReturnType<typeof data>>;
