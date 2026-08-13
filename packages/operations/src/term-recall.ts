import type { OperationContext } from "@cat/domain";
import {
  executeQuery,
  getDbHandle,
  listConceptSubjectsByConceptIds,
} from "@cat/domain";
import {
  EnrichedTermMatchSchema,
  NormalizedLanguageIdSchema,
} from "@cat/shared";
import * as z from "zod";

import {
  collectTermRecallOp,
  getTermRecallCandidates,
} from "./collect-term-recall.ts";

export const TermRecallInputSchema = z.strictObject({
  text: z.string(),
  sourceLanguageId: NormalizedLanguageIdSchema,
  translationLanguageId: NormalizedLanguageIdSchema,
  glossaryIds: z.array(z.uuidv4()).default([]),
  wordSimilarityThreshold: z.number().min(0).max(1).default(0.3),
});

export const TermContextSchema = EnrichedTermMatchSchema;

export const TermRecallOutputSchema = z.object({
  terms: z.array(TermContextSchema),
});

export type TermRecallInput = z.input<typeof TermRecallInputSchema>;
export type TermContext = z.infer<typeof TermContextSchema>;
export type TermRecallOutput = z.infer<typeof TermRecallOutputSchema>;

/** Recall terms and enrich each candidate with its concept subjects. */
export const termRecallOp = async (
  data: TermRecallInput,
  _ctx?: OperationContext,
): Promise<TermRecallOutput> => {
  const input = TermRecallInputSchema.parse(data);
  const { client: drizzle } = await getDbHandle();

  const lookedUpTerms = await collectTermRecallOp(
    {
      text: input.text,
      sourceLanguageId: input.sourceLanguageId,
      translationLanguageId: input.translationLanguageId,
      glossaryIds: input.glossaryIds,
      wordSimilarityThreshold: input.wordSimilarityThreshold,
      maxAmount: 20,
    },
    _ctx,
  );

  const candidates = getTermRecallCandidates(lookedUpTerms);
  const uniqueConceptIds = [...new Set(candidates.map((t) => t.conceptId))];
  const conceptSubjects = await executeQuery(
    { db: drizzle },
    listConceptSubjectsByConceptIds,
    { conceptIds: uniqueConceptIds },
  );

  const subjectsMap = new Map<
    number,
    { name: string; defaultDefinition: string | null }[]
  >();
  for (const row of conceptSubjects) {
    const existing = subjectsMap.get(row.conceptId);
    const subject = {
      name: row.name,
      defaultDefinition: row.defaultDefinition,
    };
    if (existing) existing.push(subject);
    else subjectsMap.set(row.conceptId, [subject]);
  }

  const terms = candidates.map((t) => ({
    term: t.term,
    translation: t.translation,
    confidence: t.confidence,
    definition: t.definition,
    conceptId: t.conceptId,
    glossaryId: t.glossaryId,
    evidences: t.evidences,
    matchedText: t.matchedText,
    concept: {
      subjects: subjectsMap.get(t.conceptId) ?? [],
      definition: t.definition,
    },
  }));

  return { terms };
};
