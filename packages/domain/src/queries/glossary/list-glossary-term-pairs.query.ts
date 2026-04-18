import {
  alias,
  and,
  count,
  eq,
  inArray,
  term,
  termConcept,
  termConceptSubject,
  termConceptToSubject,
} from "@cat/db";
import * as z from "zod";

import type { Query } from "@/types";

export const ListGlossaryTermPairsQuerySchema = z.object({
  glossaryId: z.uuidv4(),
  sourceLanguageId: z.string().min(1),
  targetLanguageId: z.string().min(1),
  pageIndex: z.int().min(0),
  pageSize: z.int().min(1),
});

export type ListGlossaryTermPairsQuery = z.infer<
  typeof ListGlossaryTermPairsQuerySchema
>;

export type GlossaryTermPairData = {
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

export type ListGlossaryTermPairsResult = {
  data: GlossaryTermPairData[];
  total: number;
};

export const listGlossaryTermPairs: Query<
  ListGlossaryTermPairsQuery,
  ListGlossaryTermPairsResult
> = async (ctx, query) => {
  const sourceTerm = alias(term, "sourceTerm");
  const targetTerm = alias(term, "targetTerm");

  const totalResult = await ctx.db
    .select({ count: count() })
    .from(termConcept)
    .innerJoin(
      sourceTerm,
      and(
        eq(termConcept.id, sourceTerm.termConceptId),
        eq(sourceTerm.languageId, query.sourceLanguageId),
      ),
    )
    .innerJoin(
      targetTerm,
      and(
        eq(termConcept.id, targetTerm.termConceptId),
        eq(targetTerm.languageId, query.targetLanguageId),
      ),
    )
    .where(eq(termConcept.glossaryId, query.glossaryId));

  const rows = await ctx.db
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
    .innerJoin(
      sourceTerm,
      and(
        eq(termConcept.id, sourceTerm.termConceptId),
        eq(sourceTerm.languageId, query.sourceLanguageId),
      ),
    )
    .innerJoin(
      targetTerm,
      and(
        eq(termConcept.id, targetTerm.termConceptId),
        eq(targetTerm.languageId, query.targetLanguageId),
      ),
    )
    .where(eq(termConcept.glossaryId, query.glossaryId))
    .limit(query.pageSize)
    .offset(query.pageIndex * query.pageSize);

  const conceptIds = [...new Set(rows.map((row) => row.conceptId))];
  const subjectMap = new Map<number, string | null>();

  if (conceptIds.length > 0) {
    const subjectRows = await ctx.db
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
          inArray(termConceptToSubject.termConceptId, conceptIds),
        ),
      );

    for (const row of subjectRows) {
      subjectMap.set(row.termConceptId, row.subject);
    }
  }

  return {
    data: rows.map((row) => ({
      ...row,
      subject: subjectMap.get(row.conceptId) ?? null,
    })),
    total: Number(totalResult[0]?.count ?? 0),
  };
};
