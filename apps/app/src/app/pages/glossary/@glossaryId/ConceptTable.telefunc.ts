import type { TermConcept } from "@cat/shared/schema/drizzle/glossary";

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

export type ConceptData = TermConcept & {
  subject: string | null;
  defaultDefinition: string | null;
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
    .select({
      ...getColumns(termConcept),
      subject: termConceptSubject.subject,
      defaultDefinition: termConceptSubject.defaultDefinition,
    })
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

export const onCreateConceptSubject = async (
  glossaryId: string,
  subject: string,
  defaultDefinition?: string,
): Promise<{ id: number }> => {
  const { client: drizzle } = await getDrizzleDB();

  const results = await drizzle
    .insert(termConceptSubject)
    .values({
      subject,
      defaultDefinition: defaultDefinition || null,
      glossaryId,
    })
    .returning({ id: termConceptSubject.id });

  return { id: results[0]!.id };
};

export const onCreateConcept = async (
  glossaryId: string,
  definition: string,
  subjectId?: number,
): Promise<{ id: number }> => {
  const { client: drizzle } = await getDrizzleDB();

  const results = await drizzle
    .insert(termConcept)
    .values({
      definition,
      subjectId: subjectId || null,
      glossaryId,
    })
    .returning({ id: termConcept.id });

  return { id: results[0]!.id };
};

export const onRequestConceptSubjects = async (
  glossaryId: string,
): Promise<Array<{ id: number; subject: string }>> => {
  const { client: drizzle } = await getDrizzleDB();

  const subjects = await drizzle
    .select({
      id: termConceptSubject.id,
      subject: termConceptSubject.subject,
    })
    .from(termConceptSubject)
    .where(eq(termConceptSubject.glossaryId, glossaryId))
    .orderBy(termConceptSubject.subject);

  return subjects;
};
