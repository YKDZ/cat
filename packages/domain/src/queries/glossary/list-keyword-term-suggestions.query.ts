import {
  and,
  eq,
  inArray,
  recallDerivationState,
  sql,
  term,
  termConcept,
  termRecallVariant,
} from "@cat/db";
import { RecallDerivationVersionSchema } from "@cat/shared";
import * as z from "zod";

import type { LookedUpTerm } from "#/queries/glossary/fetch-terms-by-concept-ids.query.ts";
import { fetchTermsByConceptIds } from "#/queries/glossary/fetch-terms-by-concept-ids.query.ts";
import type { Query } from "#/types.ts";

export const ListKeywordTermSuggestionsQuerySchema = z.strictObject({
  glossaryIds: z.array(z.uuidv4()),
  keywords: z.array(z.string().min(1)).min(1),
  sourceLanguageId: z.string().min(1),
  translationLanguageId: z.string().min(1),
  requiredDerivationVersion: RecallDerivationVersionSchema,
  maxAmount: z.int().min(1),
});

export const listKeywordTermSuggestions: Query<
  z.infer<typeof ListKeywordTermSuggestionsQuerySchema>,
  LookedUpTerm[]
> = async (ctx, input) => {
  const query = ListKeywordTermSuggestionsQuerySchema.parse(input);
  if (query.glossaryIds.length === 0) return [];
  const keywords = [...new Set(query.keywords)];
  const rows = await ctx.db
    .select({
      conceptId: termRecallVariant.conceptId,
      matchedKeywords: sql<
        string[]
      >`array_agg(DISTINCT ${termRecallVariant.normalizedText})`,
    })
    .from(termRecallVariant)
    .innerJoin(
      recallDerivationState,
      and(
        eq(recallDerivationState.id, termRecallVariant.derivationStateId),
        eq(recallDerivationState.targetKind, "TERM_CONCEPT"),
      ),
    )
    .innerJoin(termConcept, eq(termConcept.id, termRecallVariant.conceptId))
    .innerJoin(
      term,
      and(
        eq(term.termConceptId, termRecallVariant.conceptId),
        eq(term.languageId, query.sourceLanguageId),
      ),
    )
    .where(
      and(
        inArray(termConcept.glossaryId, query.glossaryIds),
        eq(termRecallVariant.languageId, query.sourceLanguageId),
        eq(termRecallVariant.variantType, "LEMMA"),
        inArray(termRecallVariant.normalizedText, keywords),
        eq(recallDerivationState.status, "FRESH"),
        eq(
          recallDerivationState.requiredDerivationVersion,
          query.requiredDerivationVersion,
        ),
        eq(
          recallDerivationState.currentDerivationVersion,
          query.requiredDerivationVersion,
        ),
        eq(
          recallDerivationState.currentCanonicalInputVersion,
          recallDerivationState.canonicalInputVersion,
        ),
        eq(
          termRecallVariant.canonicalInputVersion,
          recallDerivationState.canonicalInputVersion,
        ),
        eq(
          termRecallVariant.recallDerivationVersion,
          query.requiredDerivationVersion,
        ),
      ),
    )
    .groupBy(termRecallVariant.conceptId)
    .orderBy(
      sql`count(DISTINCT ${termRecallVariant.normalizedText}) DESC`,
      termRecallVariant.conceptId,
    )
    .limit(query.maxAmount);

  const confidence = new Map(
    rows.map((row) => [
      row.conceptId,
      row.matchedKeywords.length / keywords.length,
    ]),
  );
  const matched = new Map(
    rows.map((row) => [
      row.conceptId,
      [...row.matchedKeywords].sort().join(" "),
    ]),
  );
  const candidates = await fetchTermsByConceptIds(
    ctx.db,
    rows.map((row) => row.conceptId),
    query.sourceLanguageId,
    query.translationLanguageId,
    confidence,
  );
  return candidates.map((candidate) => {
    const matchedText = matched.get(candidate.conceptId);
    return {
      ...candidate,
      matchedText,
      evidences: [
        {
          channel: "keyword",
          matchedText,
          confidence: candidate.confidence,
          note: "analyzer-backed Recall Variant keyword overlap",
        },
      ],
    };
  });
};
