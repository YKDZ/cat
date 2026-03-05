import {
  alias,
  and,
  eq,
  getDrizzleDB,
  inArray,
  term,
  termConcept,
  count,
  termConceptSubject,
  termConceptToSubject,
} from "@cat/db";

export type PairData = {
  conceptId: number;
  definition: string | null;
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

  // 查询总数
  const totalResult = await drizzle
    .select({ count: count() })
    .from(termConcept)
    .where(eq(termConcept.glossaryId, glossaryId))
    .innerJoin(
      sourceTerm,
      and(
        eq(termConcept.id, sourceTerm.termConceptId),
        eq(sourceTerm.languageId, sourceLanguageId),
      ),
    )
    .innerJoin(
      targetTerm,
      and(
        eq(termConcept.id, targetTerm.termConceptId),
        eq(targetTerm.languageId, targetLanguageId),
      ),
    );

  const total = Number(totalResult[0]?.count ?? 0);

  // 查询数据
  const rows = await drizzle
    .select({
      conceptId: termConcept.id,
      definition: termConcept.definition,
      source: {
        termId: sourceTerm.id,
        termType: sourceTerm.type,
        termStatus: sourceTerm.status,
        text: sourceTerm.text,
      },
      target: {
        termId: targetTerm.id,
        termType: targetTerm.type,
        termStatus: targetTerm.status,
        text: targetTerm.text,
      },
    })
    .from(termConcept)
    .where(eq(termConcept.glossaryId, glossaryId))
    .innerJoin(
      sourceTerm,
      and(
        eq(termConcept.id, sourceTerm.termConceptId),
        eq(sourceTerm.languageId, sourceLanguageId),
      ),
    )
    .innerJoin(
      targetTerm,
      and(
        eq(termConcept.id, targetTerm.termConceptId),
        eq(targetTerm.languageId, targetLanguageId),
      ),
    )
    .limit(pageSize)
    .offset(pageIndex * pageSize);

  // Fetch primary subject for each concept
  const conceptIds = [...new Set(rows.map((r) => r.conceptId))];
  const subjectMap = new Map<number, string | null>();

  if (conceptIds.length > 0) {
    const subjectRows = await drizzle
      .select({
        termConceptId: termConceptToSubject.termConceptId,
        subject: termConceptSubject.subject,
      })
      .from(termConceptToSubject)
      .innerJoin(
        termConceptSubject,
        eq(termConceptToSubject.subjectId, termConceptSubject.id),
      )
      .where(
        and(
          eq(termConceptToSubject.isPrimary, true),
          // Only for concepts in our result set
          ...(conceptIds.length > 0
            ? [inArray(termConceptToSubject.termConceptId, conceptIds)]
            : []),
        ),
      );

    for (const row of subjectRows) {
      subjectMap.set(row.termConceptId, row.subject);
    }
  }

  const data: PairData[] = rows.map((r) => ({
    ...r,
    subject: subjectMap.get(r.conceptId) ?? null,
  }));

  return {
    data,
    total,
  };
};
