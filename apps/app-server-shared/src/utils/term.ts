/**
 * @module term
 *
 * Fast lexical term lookup utilities and concept vectorization text builder.
 *
 * Provides {@link lookupTerms} — a deterministic, SQL-based lookup of glossary
 * terms that lexically match input text using bidirectional `ILIKE` matching,
 * accelerated by a `pg_trgm` GIN index on `term.text`.
 *
 * The matching strategy is bidirectional:
 * - **Search bar mode** (forward `ILIKE`): finds glossary terms whose text
 *   contains the input text — effective when the input is a short keyword.
 * - **Text scanning mode** (reverse `ILIKE`): finds glossary terms whose text
 *   appears as a substring within the input text — effective when the input is
 *   a full sentence. Works for any language without segmentation or N-gram
 *   generation.
 *
 * Both directions benefit from the `pg_trgm` GIN index, which avoids full table
 * scans commonly associated with `%pattern%` queries.
 *
 * Provides {@link buildConceptVectorizationText} — constructs a structured text
 * representation of a term concept for embedding vectorization, following the
 * genus–differentia definition method.
 */
import {
  aliasedTable,
  and,
  asc,
  desc,
  or,
  eq,
  type DrizzleDB,
  ilike,
  inArray,
  sql,
  term,
  termConcept,
  termConceptSubject,
  termConceptToSubject,
} from "@cat/db";

export interface LookupTermsInput {
  glossaryIds: string[];
  text: string;
  sourceLanguageId: string;
  translationLanguageId: string;
}

export interface LookedUpTerm {
  term: string;
  translation: string;
  definition: string | null;
  conceptId: number;
  glossaryId: string;
}

/**
 * Fast lexical term lookup via bidirectional `ILIKE`.
 *
 * This is a pure DB query — no LLM, no vector services, no queue overhead.
 * Intended to be called directly from API handlers or workflow handlers.
 */
export const lookupTerms = async (
  drizzle: DrizzleDB["client"],
  input: LookupTermsInput,
): Promise<LookedUpTerm[]> => {
  const trimmedText = input.text.trim();

  // Bidirectional ILIKE matching (both accelerated by pg_trgm GIN index on term.text):
  // 1. Forward: term text CONTAINS input — for search bar (short keyword)
  // 2. Reverse: input CONTAINS term text — for text scanning (full sentence)
  const matches = await drizzle
    .selectDistinct({
      termConceptId: term.termConceptId,
    })
    .from(term)
    .innerJoin(termConcept, eq(termConcept.id, term.termConceptId))
    .where(
      and(
        inArray(termConcept.glossaryId, input.glossaryIds),
        eq(term.languageId, input.sourceLanguageId),
        or(
          // Forward: glossary term contains the input text
          ilike(term.text, `%${trimmedText}%`),
          // Reverse: input text contains the glossary term
          sql`${trimmedText} ILIKE '%' || ${term.text} || '%'`,
        ),
      ),
    )
    .limit(50);

  if (matches.length === 0) {
    return [];
  }

  const termConceptIds = matches.map((m) => m.termConceptId);
  return await fetchTerms(
    drizzle,
    termConceptIds,
    input.sourceLanguageId,
    input.translationLanguageId,
  );
};

/**
 * Fetch full term pair details for a list of concept IDs.
 *
 * Unlike {@link lookupTerms}, this does not perform any matching — it simply
 * resolves the source + translation term texts and definition for the given
 * concept IDs. Pairs with no matching term in either language are omitted.
 */
export const fetchTermsByConceptIds = async (
  drizzle: DrizzleDB["client"],
  conceptIds: number[],
  sourceLanguageId: string,
  translationLanguageId: string,
): Promise<LookedUpTerm[]> => {
  if (conceptIds.length === 0) return [];
  return fetchTerms(
    drizzle,
    conceptIds,
    sourceLanguageId,
    translationLanguageId,
  );
};

const fetchTerms = async (
  drizzle: DrizzleDB["client"],
  termConceptIds: number[],
  sourceLanguageId: string,
  translationLanguageId: string,
): Promise<LookedUpTerm[]> => {
  const sourceTerm = aliasedTable(term, "sourceTerm");
  const translationTerm = aliasedTable(term, "translationTerm");

  const results = await drizzle
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
        eq(sourceTerm.languageId, sourceLanguageId),
      ),
    )
    .innerJoin(
      translationTerm,
      and(
        eq(translationTerm.termConceptId, termConcept.id),
        eq(translationTerm.languageId, translationLanguageId),
      ),
    )
    .where(inArray(termConcept.id, termConceptIds));

  // Fetch primary subject definition for each concept if available
  const conceptIds = [...new Set(results.map((r) => r.conceptId))];
  const subjectMap = new Map<number, string | null>();

  if (conceptIds.length > 0) {
    const subjectRows = await drizzle
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

    for (const row of subjectRows) {
      subjectMap.set(row.termConceptId, row.defaultDefinition);
    }
  }

  return results.map((r) => ({
    term: r.term,
    translation: r.translation,
    definition: r.definition || subjectMap.get(r.conceptId) || null,
    conceptId: r.conceptId,
    glossaryId: r.glossaryId,
  }));
};

/**
 * Maximum number of term entries to include in the vectorization text.
 * Per-language pruning: 1 entry per language, sorted by status/type/createdAt.
 */
const MAX_TERMS_FOR_VECTORIZATION = 6;

/** Maximum number of subjects to include in the vectorization text. */
const MAX_SUBJECTS_FOR_VECTORIZATION = 3;

/**
 * Build a structured text representation of a term concept for embedding
 * vectorization, following the genus–differentia definition method.
 *
 * Output format:
 * ```
 * Terms: creeper、苦力怕、爬行者
 * Subjects:
 *  - 敌对生物: 危险且具侵略性的生物…
 * Definition: 绿色的，会悄悄接近玩家并自爆的怪物。
 * ```
 *
 * Returns `null` if no meaningful content exists (no terms, no subjects, no definition),
 * indicating that this concept should not be vectorized.
 */
export const buildConceptVectorizationText = async (
  drizzle: DrizzleDB["client"],
  conceptId: number,
): Promise<string | null> => {
  // 1. Fetch concept definition
  const conceptRows = await drizzle
    .select({ definition: termConcept.definition })
    .from(termConcept)
    .where(eq(termConcept.id, conceptId))
    .limit(1);

  if (conceptRows.length === 0) return null;
  const definition = conceptRows[0].definition;

  // 2. Fetch subjects via M:N junction table (limit 3, alphabetical order)
  const subjectRows = await drizzle
    .select({
      subject: termConceptSubject.subject,
      defaultDefinition: termConceptSubject.defaultDefinition,
    })
    .from(termConceptToSubject)
    .innerJoin(
      termConceptSubject,
      eq(termConceptToSubject.subjectId, termConceptSubject.id),
    )
    .where(eq(termConceptToSubject.termConceptId, conceptId))
    .orderBy(asc(termConceptSubject.subject))
    .limit(MAX_SUBJECTS_FOR_VECTORIZATION);

  // 3. Fetch terms (pruned: per-language 1 entry, prefer PREFERRED status, newer first)
  // Use window function approach: rank by language, pick top 1 per language
  const allTerms = await drizzle
    .select({
      text: term.text,
      languageId: term.languageId,
      status: term.status,
      type: term.type,
      createdAt: term.createdAt,
    })
    .from(term)
    .where(eq(term.termConceptId, conceptId))
    .orderBy(
      // PREFERRED status first
      sql`CASE WHEN ${term.status} = 'PREFERRED' THEN 0 WHEN ${term.status} = 'NOT_SPECIFIED' THEN 1 ELSE 2 END`,
      // FULL_FORM type first
      sql`CASE WHEN ${term.type} = 'FULL_FORM' THEN 0 WHEN ${term.type} = 'NOT_SPECIFIED' THEN 1 ELSE 2 END`,
      desc(term.createdAt),
    );

  // Per-language pruning: take first (best-ranked) entry per language
  const seenLanguages = new Set<string>();
  const prunedTerms: string[] = [];
  for (const t of allTerms) {
    if (seenLanguages.has(t.languageId)) continue;
    seenLanguages.add(t.languageId);
    prunedTerms.push(t.text);
    if (prunedTerms.length >= MAX_TERMS_FOR_VECTORIZATION) break;
  }

  // 4. Build structured text — empty sections are omitted
  const sections: string[] = [];

  if (prunedTerms.length > 0) {
    sections.push(`Terms: ${prunedTerms.join("、")}`);
  }

  if (subjectRows.length > 0) {
    const subjectLines = subjectRows.map((s) =>
      s.defaultDefinition
        ? ` - ${s.subject}: ${s.defaultDefinition}`
        : ` - ${s.subject}`,
    );
    sections.push(`Subjects:\n${subjectLines.join("\n")}`);
  }

  if (definition) sections.push(`Definition: ${definition}`);

  // If all sections are empty, return null (no vectorization needed)
  if (sections.length === 0) return null;

  return sections.join("\n");
};
