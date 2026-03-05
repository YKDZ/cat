import type { TermConcept } from "@cat/shared/schema/drizzle/glossary";

import { triggerConceptRevectorize } from "@cat/app-server-shared/operations";
import {
  eq,
  getColumns,
  getDrizzleDB,
  termConcept,
  termConceptSubject,
  termConceptToSubject,
  count,
  term,
} from "@cat/db";

export type ConceptData = TermConcept & {
  subjects: Array<{ subject: string; defaultDefinition: string | null }>;
  termCount: number;
  sampleTerms: Array<{
    id: number;
    text: string;
    languageId: string;
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
    .where(eq(termConcept.glossaryId, glossaryId));

  const total = Number(totalResult[0]?.count ?? 0);

  // 查询概念数据
  const concepts = await drizzle
    .select({
      ...getColumns(termConcept),
    })
    .from(termConcept)
    .where(eq(termConcept.glossaryId, glossaryId))
    .limit(pageSize)
    .offset(pageIndex * pageSize);

  // 为每个概念查询 subjects (M:N)、术语数量和示例术语
  const data = await Promise.all(
    concepts.map(async (concept) => {
      // 查询 subjects via junction table
      const subjects = await drizzle
        .select({
          subject: termConceptSubject.subject,
          defaultDefinition: termConceptSubject.defaultDefinition,
        })
        .from(termConceptToSubject)
        .innerJoin(
          termConceptSubject,
          eq(termConceptToSubject.subjectId, termConceptSubject.id),
        )
        .where(eq(termConceptToSubject.termConceptId, concept.id));

      // 查询术语数量
      const termCountResult = await drizzle
        .select({ count: count() })
        .from(term)
        .where(eq(term.termConceptId, concept.id));

      const termCount = Number(termCountResult[0]?.count ?? 0);

      // 查询示例术语（最多 3 个）— directly from term.text
      const sampleTerms = await drizzle
        .select({
          id: term.id,
          text: term.text,
          languageId: term.languageId,
          type: term.type,
          status: term.status,
        })
        .from(term)
        .where(eq(term.termConceptId, concept.id))
        .limit(3);

      return {
        ...concept,
        subjects,
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
  subjectIds?: number[],
): Promise<{ id: number }> => {
  const { client: drizzle } = await getDrizzleDB();

  return await drizzle.transaction(async (tx) => {
    const results = await tx
      .insert(termConcept)
      .values({
        definition,
        glossaryId,
      })
      .returning({ id: termConcept.id });

    const conceptId = results[0]!.id;

    if (subjectIds && subjectIds.length > 0) {
      await tx.insert(termConceptToSubject).values(
        subjectIds.map((subjectId, idx) => ({
          termConceptId: conceptId,
          subjectId,
          isPrimary: idx === 0,
        })),
      );
    }

    // fire-and-forget: 向量化新概念的定义文本
    triggerConceptRevectorize(conceptId);

    return { id: conceptId };
  });
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
