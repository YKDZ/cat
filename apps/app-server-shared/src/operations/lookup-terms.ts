/**
 * @module lookup-terms
 *
 * Standard operation wrapper for lexical term lookup.
 *
 * Combines two matching strategies:
 * 1. **ILIKE** (bidirectional, existing) — confidence = 1.0
 * 2. **`word_similarity()`** (new, pg_trgm) — confidence = actual similarity value
 *
 * Results are merged by `(term, languageId, conceptId)` composite key,
 * keeping the highest confidence per key.
 */
import {
  and,
  eq,
  getDrizzleDB,
  ilike,
  inArray,
  or,
  sql,
  term,
  termConcept,
  type DrizzleDB,
} from "@cat/db";
import * as z from "zod";

import type { OperationContext } from "@/operations/types";

import { fetchTermsByConceptIds, type LookedUpTerm } from "@/utils/term";

export const LookupTermsInputSchema = z.object({
  glossaryIds: z.array(z.string()),
  text: z.string(),
  sourceLanguageId: z.string(),
  translationLanguageId: z.string(),
  wordSimilarityThreshold: z.number().min(0).max(1).optional().default(0.3),
});

export const LookupTermsOutputSchema = z.array(
  z.object({
    term: z.string(),
    translation: z.string(),
    definition: z.string().nullable(),
    conceptId: z.int(),
    glossaryId: z.string(),
    confidence: z.number().min(0).max(1),
  }),
);

export type LookupTermsInput = z.input<typeof LookupTermsInputSchema>;
export type LookupTermsOutput = z.infer<typeof LookupTermsOutputSchema>;

/**
 * Lexical term lookup with ILIKE (confidence=1) + word_similarity() fuzzy matching.
 *
 * Bidirectional ILIKE matches are returned with confidence = 1.0.
 * word_similarity() matches are returned with confidence = actual similarity score.
 * Results are deduplicated by (term text, conceptId), keeping the highest confidence.
 */
export const lookupTermsOp = async (
  data: LookupTermsInput,
  _ctx?: OperationContext,
): Promise<LookupTermsOutput> => {
  if (data.glossaryIds.length === 0) return [];

  const { client: drizzle } = await getDrizzleDB();
  const trimmedText = data.text.trim();
  if (trimmedText.length === 0) return [];

  // Run ILIKE and word_similarity in parallel
  const [ilikeResults, wordSimResults] = await Promise.all([
    ilikeMatch(drizzle, data, trimmedText),
    wordSimilarityMatch(drizzle, data, trimmedText),
  ]);

  // Merge: build confidence map keyed by conceptId, taking max confidence
  const confidenceMap = new Map<number, number>();
  for (const r of ilikeResults) {
    confidenceMap.set(r.conceptId, 1.0);
  }
  for (const r of wordSimResults) {
    const existing = confidenceMap.get(r.conceptId);
    if (existing === undefined || r.similarity > existing) {
      confidenceMap.set(r.conceptId, r.similarity);
    }
  }

  // Collect all unique concept IDs
  const allConceptIds = [...confidenceMap.keys()];
  if (allConceptIds.length === 0) return [];

  // Fetch full term pairs with confidence
  const terms = await fetchTermsByConceptIds(
    drizzle,
    allConceptIds,
    data.sourceLanguageId,
    data.translationLanguageId,
    confidenceMap,
  );

  // Deduplicate by (term text, conceptId) composite key, taking highest confidence
  const seen = new Map<string, LookedUpTerm>();
  for (const t of terms) {
    const key = `${t.term}\0${t.conceptId}`;
    const existing = seen.get(key);
    if (!existing || t.confidence > existing.confidence) {
      seen.set(key, t);
    }
  }

  return [...seen.values()].sort((a, b) => b.confidence - a.confidence);
};

/**
 * Bidirectional ILIKE matching (existing strategy).
 * Returns matched conceptIds only — confidence is always 1.0.
 */
const ilikeMatch = async (
  drizzle: DrizzleDB["client"],
  data: LookupTermsInput,
  trimmedText: string,
): Promise<{ conceptId: number }[]> => {
  const matches = await drizzle
    .selectDistinct({
      conceptId: term.termConceptId,
    })
    .from(term)
    .innerJoin(termConcept, eq(termConcept.id, term.termConceptId))
    .where(
      and(
        inArray(termConcept.glossaryId, data.glossaryIds),
        eq(term.languageId, data.sourceLanguageId),
        or(
          ilike(term.text, `%${trimmedText}%`),
          sql`${trimmedText} ILIKE '%' || ${term.text} || '%'`,
        ),
      ),
    )
    .limit(50);

  return matches;
};

/**
 * word_similarity() fuzzy matching via pg_trgm.
 * Returns conceptId + similarity score.
 */
const wordSimilarityMatch = async (
  drizzle: DrizzleDB["client"],
  data: LookupTermsInput,
  trimmedText: string,
): Promise<{ conceptId: number; similarity: number }[]> => {
  const threshold = data.wordSimilarityThreshold ?? 0.3;

  const matches = await drizzle
    .selectDistinctOn([term.termConceptId], {
      conceptId: term.termConceptId,
      similarity: sql<number>`word_similarity(${term.text}, ${trimmedText})`,
    })
    .from(term)
    .innerJoin(termConcept, eq(termConcept.id, term.termConceptId))
    .where(
      and(
        inArray(termConcept.glossaryId, data.glossaryIds),
        eq(term.languageId, data.sourceLanguageId),
        sql`word_similarity(${term.text}, ${trimmedText}) >= ${threshold}`,
      ),
    )
    .orderBy(
      term.termConceptId,
      sql`word_similarity(${term.text}, ${trimmedText}) DESC`,
    )
    .limit(50);

  return matches;
};
