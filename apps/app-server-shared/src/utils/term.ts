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
  definition: string;
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
  return await fetchTerms(
    drizzle,
    termConceptIds,
    input.glossaryIds,
    input.sourceLanguageId,
    input.translationLanguageId,
  );
};

const fetchTerms = async (
  drizzle: DrizzleDB["client"],
  termConceptIds: number[],
  glossaryIds: string[],
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

  return drizzle
    .select({
      term: sourceString.value,
      translation: translationString.value,
      definition: termConcept.definition,
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
    .where(
      and(
        inArray(termConcept.id, termConceptIds),
        inArray(termConcept.glossaryId, glossaryIds),
      ),
    );
};
