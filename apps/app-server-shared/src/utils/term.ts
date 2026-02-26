/**
 * @module term
 *
 * Fast lexical term lookup utilities.
 *
 * Provides {@link lookupTerms} — a deterministic, SQL-based lookup of glossary
 * terms that lexically match input text using bidirectional `ILIKE` matching,
 * accelerated by a `pg_trgm` GIN index on `TranslatableString.value`.
 *
 * The matching strategy is bidirectional:
 * - **Search bar mode** (forward `ILIKE`): finds glossary terms whose value
 *   contains the input text — effective when the input is a short keyword.
 * - **Text scanning mode** (reverse `ILIKE`): finds glossary terms whose value
 *   appears as a substring within the input text — effective when the input is
 *   a full sentence. Works for any language without segmentation or N-gram
 *   generation.
 *
 * Both directions benefit from the `pg_trgm` GIN index, which avoids full table
 * scans commonly associated with `%pattern%` queries.
 */
import {
  aliasedTable,
  and,
  or,
  eq,
  type DrizzleDB,
  ilike,
  inArray,
  sql,
  term,
  termConcept,
  termConceptSubject,
  translatableString,
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

  // Bidirectional ILIKE matching (both accelerated by pg_trgm GIN index):
  // 1. Forward: term value CONTAINS input — for search bar (short keyword)
  // 2. Reverse: input CONTAINS term value — for text scanning (full sentence)
  const matches = await drizzle
    .selectDistinct({
      termConceptId: term.termConceptId,
      glossaryId: termConcept.glossaryId,
    })
    .from(term)
    .innerJoin(termConcept, eq(termConcept.id, term.termConceptId))
    .innerJoin(translatableString, eq(translatableString.id, term.stringId))
    .where(
      and(
        inArray(termConcept.glossaryId, input.glossaryIds),
        eq(translatableString.languageId, input.sourceLanguageId),
        or(
          // Forward: glossary term contains the input text
          ilike(translatableString.value, `%${trimmedText}%`),
          // Reverse: input text contains the glossary term
          sql`${trimmedText} ILIKE '%' || ${translatableString.value} || '%'`,
        ),
      ),
    )
    .limit(50);

  if (matches.length === 0) {
    return [];
  }

  const termConceptIds = matches.map((m) => m.termConceptId);
  const glossaryIdMap = new Map(
    matches.map((m) => [m.termConceptId, m.glossaryId]),
  );
  return await fetchTerms(
    drizzle,
    termConceptIds,
    glossaryIdMap,
    input.sourceLanguageId,
    input.translationLanguageId,
  );
};

const fetchTerms = async (
  drizzle: DrizzleDB["client"],
  termConceptIds: number[],
  glossaryIdMap: Map<number, string>,
  sourceLanguageId: string,
  translationLanguageId: string,
): Promise<LookedUpTerm[]> => {
  const sourceTerm = aliasedTable(term, "sourceTerm");
  const translationTerm = aliasedTable(term, "translationTerm");
  const sourceString = aliasedTable(translatableString, "sourceString");
  const translationString = aliasedTable(
    translatableString,
    "translationString",
  );

  const results = await drizzle
    .select({
      term: sourceString.value,
      translation: translationString.value,
      definition: termConcept.definition,
      defaultDefinition: termConceptSubject.defaultDefinition,
      conceptId: termConcept.id,
      glossaryId: termConcept.glossaryId,
    })
    .from(termConcept)
    .innerJoin(sourceTerm, eq(sourceTerm.termConceptId, termConcept.id))
    .innerJoin(
      translationTerm,
      eq(translationTerm.termConceptId, termConcept.id),
    )
    .innerJoin(
      sourceString,
      and(
        eq(sourceString.id, sourceTerm.stringId),
        eq(sourceString.languageId, sourceLanguageId),
      ),
    )
    .innerJoin(
      translationString,
      and(
        eq(translationString.id, translationTerm.stringId),
        eq(translationString.languageId, translationLanguageId),
      ),
    )
    .leftJoin(
      termConceptSubject,
      eq(termConcept.subjectId, termConceptSubject.id),
    )
    .where(
      and(
        inArray(termConcept.id, termConceptIds),
        inArray(termConcept.glossaryId, Array.from(glossaryIdMap.values())),
      ),
    );

  return results.map((r) => ({
    term: r.term,
    translation: r.translation,
    definition: r.definition || r.defaultDefinition,
    conceptId: r.conceptId,
    glossaryId: r.glossaryId,
  }));
};
