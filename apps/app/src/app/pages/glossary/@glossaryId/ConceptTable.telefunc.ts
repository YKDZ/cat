import {
  eq,
  getColumns,
  getDrizzleDB,
  termConcept,
  termConceptSubject,
  count,
  term,
  translatableString,
} from "@cat/db";
import type { TermConcept } from "@cat/shared/schema/drizzle/glossary";

export type ConceptData = TermConcept & {
  subject: string | null;
  termCount: number;
  sampleTerms: Array<{
    id: number;
    text: string;
    type: string;
    status: string;
  }>;
};

export type PagedResult<T> = {
  data: T[];
  total: number;
};

export const onRequestConcept = async (
  glossaryId: string,
  pageIndex: number,
  pageSize: number,
): Promise<PagedResult<ConceptData>> => {
  const { client: drizzle } = await getDrizzleDB();

  // 查询总数
  const totalResult = await drizzle
    .select({ count: count() })
    .from(termConcept)
    .where(eq(termConcept.glossaryId, glossaryId))
    .leftJoin(
      termConceptSubject,
      eq(termConcept.subjectId, termConceptSubject.id),
    );

  const total = Number(totalResult[0]?.count ?? 0);

  // 查询概念数据
  const concepts = await drizzle
    .select({ ...getColumns(termConcept), subject: termConceptSubject.subject })
    .from(termConcept)
    .where(eq(termConcept.glossaryId, glossaryId))
    .leftJoin(
      termConceptSubject,
      eq(termConcept.subjectId, termConceptSubject.id),
    )
    .limit(pageSize)
    .offset(pageIndex * pageSize);

  // 为每个概念查询术语数量和示例术语
  const data = await Promise.all(
    concepts.map(async (concept) => {
      // 查询术语数量
      const termCountResult = await drizzle
        .select({ count: count() })
        .from(term)
        .where(eq(term.termConceptId, concept.id));

      const termCount = Number(termCountResult[0]?.count ?? 0);

      // 查询示例术语（最多 3 个）
      const sampleTerms = await drizzle
        .select({
          id: term.id,
          text: translatableString.value,
          type: term.type,
          status: term.status,
        })
        .from(term)
        .innerJoin(translatableString, eq(term.stringId, translatableString.id))
        .where(eq(term.termConceptId, concept.id))
        .limit(3);

      return {
        ...concept,
        termCount,
        sampleTerms,
      };
    }),
  );

  return {
    data,
    total,
  };
};
