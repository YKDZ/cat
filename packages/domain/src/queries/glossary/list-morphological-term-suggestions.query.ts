import {
  aliasedTable,
  and,
  eq,
  inArray,
  recallDerivationState,
  sql,
  term,
  termConcept,
  termRecallVariant,
} from "@cat/db";
import {
  NormalizedLanguageIdSchema,
  RecallDerivationVersionSchema,
  type TermMatch,
} from "@cat/shared";
import * as z from "zod";

import { fetchTermsByConceptIds } from "#/queries/glossary/fetch-terms-by-concept-ids.query.ts";
import type { Query } from "#/types.ts";

export const ListMorphologicalTermSuggestionsQuerySchema = z.object({
  glossaryIds: z.array(z.uuidv4()),
  normalizedText: z.string(),
  sourceLanguageId: NormalizedLanguageIdSchema,
  translationLanguageId: NormalizedLanguageIdSchema,
  minSimilarity: z.number().min(0).max(1).default(0.7),
  maxAmount: z.int().min(1).default(20),
  requiredDerivationVersion: RecallDerivationVersionSchema,
});

export type ListMorphologicalTermSuggestionsQuery = z.infer<
  typeof ListMorphologicalTermSuggestionsQuerySchema
>;
type ListMorphologicalTermSuggestionsQueryInput = z.input<
  typeof ListMorphologicalTermSuggestionsQuerySchema
>;

/**
 * Query `TermRecallVariant` by trigram similarity on `normalizedText`,
 * then assemble full term pairs via `fetchTermsByConceptIds`.
 *
 * Returns term matches with confidence derived from trigram similarity.
 */
export const listMorphologicalTermSuggestions: Query<
  ListMorphologicalTermSuggestionsQueryInput,
  TermMatch[]
> = async (ctx, input) => {
  const query = ListMorphologicalTermSuggestionsQuerySchema.parse(input);
  if (query.glossaryIds.length === 0) return [];

  const normalizedText = query.normalizedText.trim();
  if (normalizedText.length === 0) return [];

  // Step 1: Find matching variants by trigram similarity on normalizedText
  const sourceTerm = aliasedTable(term, "sourceTerm");

  const variantRows = await ctx.db
    .select({
      conceptId: termRecallVariant.conceptId,
      matchedText: termRecallVariant.text,
      normalizedText: termRecallVariant.normalizedText,
      variantType: termRecallVariant.variantType,
      similarity: sql<number>`similarity(${termRecallVariant.normalizedText}, ${normalizedText})`,
    })
    .from(termRecallVariant)
    .innerJoin(
      recallDerivationState,
      and(
        eq(recallDerivationState.id, termRecallVariant.derivationStateId),
        eq(recallDerivationState.targetKind, "TERM_CONCEPT"),
        sql`${recallDerivationState.targetId} = ${termRecallVariant.conceptId}::text`,
        eq(recallDerivationState.languageId, termRecallVariant.languageId),
      ),
    )
    .innerJoin(termConcept, eq(termConcept.id, termRecallVariant.conceptId))
    .innerJoin(
      sourceTerm,
      and(
        eq(sourceTerm.termConceptId, termRecallVariant.conceptId),
        eq(sourceTerm.languageId, query.sourceLanguageId),
      ),
    )
    .where(
      and(
        inArray(termConcept.glossaryId, query.glossaryIds),
        eq(termRecallVariant.languageId, query.sourceLanguageId),
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
        sql`similarity(${termRecallVariant.normalizedText}, ${normalizedText}) >= ${query.minSimilarity}`,
      ),
    )
    .orderBy(
      sql`similarity(${termRecallVariant.normalizedText}, ${normalizedText}) DESC`,
    )
    .limit(query.maxAmount);

  if (variantRows.length === 0) return [];

  // Step 2: Build confidence map by conceptId (keep highest)
  const confidenceMap = new Map<number, number>();
  const matchedTextMap = new Map<number, string>();
  const variantTypeMap = new Map<number, string>();

  for (const row of variantRows) {
    const existing = confidenceMap.get(row.conceptId) ?? 0;
    if (row.similarity > existing) {
      confidenceMap.set(row.conceptId, row.similarity);
      matchedTextMap.set(row.conceptId, row.matchedText);
      variantTypeMap.set(row.conceptId, row.variantType);
    }
  }

  // Step 3: Fetch full term pairs
  const conceptIds = [...confidenceMap.keys()];
  const terms = await fetchTermsByConceptIds(
    ctx.db,
    conceptIds,
    query.sourceLanguageId,
    query.translationLanguageId,
    confidenceMap,
  );

  return terms.map((term) => {
    const matchedText = matchedTextMap.get(term.conceptId);
    const matchedVariantType = variantTypeMap.get(term.conceptId);
    return {
      ...term,
      matchedText,
      evidences: [
        {
          channel: "morphological",
          matchedText,
          matchedVariantText: matchedText,
          matchedVariantType,
          confidence: term.confidence,
          note: "recall variant similarity match",
        },
      ],
    };
  });
};
