import {
  and,
  eq,
  inArray,
  sql,
  term,
  termConcept,
  termRecallVariant,
} from "@cat/db";
import * as z from "zod";

import type { Query } from "@/types";

export const ListTermConceptIdsByRecallVariantsQuerySchema = z.object({
  glossaryIds: z.array(z.uuidv4()),
  normalizedText: z.string(),
  sourceLanguageId: z.string().min(1),
  minSimilarity: z.number().min(0).max(1).default(0.8),
  maxAmount: z.int().min(1).default(50),
});

export type ListTermConceptIdsByRecallVariantsQuery = z.infer<
  typeof ListTermConceptIdsByRecallVariantsQuerySchema
>;

/**
 * Lightweight query that returns only the set of conceptIds whose
 * `TermRecallVariant` records match the given normalizedText by trigram
 * similarity. Used by `deduplicateAndMatchOp` to check existence without
 * fetching the full term pair data.
 */
export const listTermConceptIdsByRecallVariants: Query<
  ListTermConceptIdsByRecallVariantsQuery,
  number[]
> = async (ctx, query) => {
  if (query.glossaryIds.length === 0) return [];

  const normalizedText = query.normalizedText.trim();
  if (normalizedText.length === 0) return [];

  const rows = await ctx.db
    .selectDistinct({ conceptId: termRecallVariant.conceptId })
    .from(termRecallVariant)
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
        sql`similarity(${termRecallVariant.normalizedText}, ${normalizedText}) >= ${query.minSimilarity}`,
      ),
    )
    .limit(query.maxAmount);

  return rows.map((r) => r.conceptId);
};
