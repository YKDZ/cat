import {
  alias,
  and,
  eq,
  getDrizzleDB,
  term,
  termConcept,
  translatableString,
} from "@cat/db";

export type PairData = {
  conceptId: number;
  definition: string;
  source: {
    termId: number;
    termType: string;
    termStatus: string;
    text: string;
  };
  target: {
    termId: number;
    termType: string;
    termStatus: string;
    text: string;
  };
};

export const onRequestTermPair = async (
  glossaryId: string,
  sourceLanguageId: string,
  targetLanguageId: string,
  pageIndex: number,
  pageSize: number,
): Promise<PairData[]> => {
  const { client: drizzle } = await getDrizzleDB();

  const sourceTerm = alias(term, "sourceTerm");
  const targetTerm = alias(term, "targetTerm");
  const sourceString = alias(translatableString, "sourceString");
  const targetString = alias(translatableString, "targetString");

  return await drizzle
    .select({
      conceptId: termConcept.id,
      definition: termConcept.definition,
      source: {
        termId: sourceTerm.id,
        termType: sourceTerm.type,
        termStatus: sourceTerm.status,
        text: sourceString.value,
      },
      target: {
        termId: targetTerm.id,
        termType: targetTerm.type,
        termStatus: targetTerm.status,
        text: targetString.value,
      },
    })
    .from(termConcept)
    .where(eq(termConcept.glossaryId, glossaryId))
    .innerJoin(sourceTerm, eq(termConcept.id, sourceTerm.termConceptId))
    .innerJoin(
      sourceString,
      and(
        eq(sourceTerm.stringId, sourceString.id),
        eq(sourceString.languageId, sourceLanguageId),
      ),
    )
    .innerJoin(targetTerm, eq(termConcept.id, targetTerm.termConceptId))
    .innerJoin(
      targetString,
      and(
        eq(targetTerm.stringId, targetString.id),
        eq(targetString.languageId, targetLanguageId),
      ),
    )
    .limit(pageSize)
    .offset(pageIndex * pageSize);
};
