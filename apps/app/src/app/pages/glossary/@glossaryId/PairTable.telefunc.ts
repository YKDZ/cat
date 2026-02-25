import {
  alias,
  and,
  eq,
  getDrizzleDB,
  term,
  termConcept,
  translatableString,
  count,
  termConceptSubject,
} from "@cat/db";

export type PairData = {
  conceptId: number;
  definition: string;
  subject: string | null;
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

export type PagedResult<T> = {
  data: T[];
  total: number;
};

export const onRequestTermPair = async (
  glossaryId: string,
  sourceLanguageId: string,
  targetLanguageId: string,
  pageIndex: number,
  pageSize: number,
): Promise<PagedResult<PairData>> => {
  const { client: drizzle } = await getDrizzleDB();

  const sourceTerm = alias(term, "sourceTerm");
  const targetTerm = alias(term, "targetTerm");
  const sourceString = alias(translatableString, "sourceString");
  const targetString = alias(translatableString, "targetString");

  // 查询总数
  const totalResult = await drizzle
    .select({ count: count() })
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
    );

  const total = Number(totalResult[0]?.count ?? 0);

  // 查询数据
  const data = await drizzle
    .select({
      conceptId: termConcept.id,
      definition: termConcept.definition,
      subject: termConceptSubject.subject,
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
    .leftJoin(
      termConceptSubject,
      eq(termConcept.subjectId, termConceptSubject.id),
    )
    .limit(pageSize)
    .offset(pageIndex * pageSize);

  return {
    data,
    total,
  };
};
