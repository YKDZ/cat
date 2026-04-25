import type { TermMatch } from "@cat/shared";

import {
  aliasedTable,
  and,
  eq,
  ilike,
  inArray,
  or,
  sql,
  term,
  termConcept,
  termConceptSubject,
  termConceptToSubject,
} from "@cat/db";
import * as z from "zod";

import type { Query } from "@/types";

export const ListLexicalTermSuggestionsQuerySchema = z.object({
  glossaryIds: z.array(z.uuidv4()),
  text: z.string(),
  sourceLanguageId: z.string().min(1),
  translationLanguageId: z.string().min(1),
  wordSimilarityThreshold: z.number().min(0).max(1).default(0.3),
});

export type ListLexicalTermSuggestionsQuery = z.infer<
  typeof ListLexicalTermSuggestionsQuerySchema
>;

export type LexicalTermSuggestion = TermMatch;

export const listLexicalTermSuggestions: Query<
  ListLexicalTermSuggestionsQuery,
  LexicalTermSuggestion[]
> = async (ctx, query) => {
  if (query.glossaryIds.length === 0) return [];

  const trimmedText = query.text.trim();
  if (trimmedText.length === 0) return [];

  const [ilikeMatches, wordSimilarityMatches] = await Promise.all([
    ctx.db
      .selectDistinct({
        conceptId: term.termConceptId,
      })
      .from(term)
      .innerJoin(termConcept, eq(termConcept.id, term.termConceptId))
      .where(
        and(
          inArray(termConcept.glossaryId, query.glossaryIds),
          eq(term.languageId, query.sourceLanguageId),
          or(
            ilike(term.text, `%${trimmedText}%`),
            sql`${trimmedText} ILIKE '%' || ${term.text} || '%'`,
          ),
        ),
      )
      .limit(50),
    ctx.db
      .selectDistinctOn([term.termConceptId], {
        conceptId: term.termConceptId,
        similarity: sql<number>`word_similarity(${term.text}, ${trimmedText})`,
      })
      .from(term)
      .innerJoin(termConcept, eq(termConcept.id, term.termConceptId))
      .where(
        and(
          inArray(termConcept.glossaryId, query.glossaryIds),
          eq(term.languageId, query.sourceLanguageId),
          sql`word_similarity(${term.text}, ${trimmedText}) >= ${query.wordSimilarityThreshold}`,
        ),
      )
      .orderBy(
        term.termConceptId,
        sql`word_similarity(${term.text}, ${trimmedText}) DESC`,
      )
      .limit(50),
  ]);

  const confidenceMap = new Map<number, number>();

  for (const row of ilikeMatches) {
    confidenceMap.set(row.conceptId, 1.0);
  }

  for (const row of wordSimilarityMatches) {
    const existing = confidenceMap.get(row.conceptId);
    if (existing === undefined || row.similarity > existing) {
      confidenceMap.set(row.conceptId, row.similarity);
    }
  }

  const conceptIds = [...confidenceMap.keys()];
  if (conceptIds.length === 0) return [];

  const sourceTerm = aliasedTable(term, "sourceTerm");
  const translationTerm = aliasedTable(term, "translationTerm");

  const termRows = await ctx.db
    .select({
      term: sourceTerm.text,
      translation: translationTerm.text,
      definition: termConcept.definition,
      conceptId: termConcept.id,
      glossaryId: termConcept.glossaryId,
    })
    .from(termConcept)
    .innerJoin(
      sourceTerm,
      and(
        eq(sourceTerm.termConceptId, termConcept.id),
        eq(sourceTerm.languageId, query.sourceLanguageId),
      ),
    )
    .innerJoin(
      translationTerm,
      and(
        eq(translationTerm.termConceptId, termConcept.id),
        eq(translationTerm.languageId, query.translationLanguageId),
      ),
    )
    .where(inArray(termConcept.id, conceptIds));

  const subjectRows = await ctx.db
    .select({
      termConceptId: termConceptToSubject.termConceptId,
      defaultDefinition: termConceptSubject.defaultDefinition,
    })
    .from(termConceptToSubject)
    .innerJoin(
      termConceptSubject,
      eq(termConceptToSubject.subjectId, termConceptSubject.id),
    )
    .where(
      and(
        inArray(termConceptToSubject.termConceptId, conceptIds),
        eq(termConceptToSubject.isPrimary, true),
      ),
    );

  const primarySubjectDefinitionMap = new Map<number, string | null>();
  for (const row of subjectRows) {
    primarySubjectDefinitionMap.set(row.termConceptId, row.defaultDefinition);
  }

  const seen = new Map<string, LexicalTermSuggestion>();

  for (const row of termRows) {
    const confidence = confidenceMap.get(row.conceptId) ?? 1.0;
    const mapped: LexicalTermSuggestion = {
      term: row.term,
      translation: row.translation,
      definition:
        row.definition ??
        primarySubjectDefinitionMap.get(row.conceptId) ??
        null,
      conceptId: row.conceptId,
      glossaryId: row.glossaryId,
      confidence,
      evidences: [
        {
          channel: "lexical",
          matchedText: row.term,
          matchedVariantText: row.term,
          confidence,
          note: "pg_trgm lexical match",
        },
      ],
      matchedText: row.term,
    };

    const key = `${mapped.term}\0${mapped.conceptId}`;
    const existing = seen.get(key);
    if (!existing || mapped.confidence > existing.confidence) {
      seen.set(key, mapped);
    }
  }

  return [...seen.values()].sort(
    (a, b) => b.confidence - a.confidence || b.term.length - a.term.length,
  );
};
