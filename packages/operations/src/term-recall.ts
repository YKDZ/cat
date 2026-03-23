import type { OperationContext } from "@cat/domain";

import {
  executeQuery,
  getDbHandle,
  listConceptSubjectsByConceptIds,
  listLexicalTermSuggestions,
} from "@cat/domain";
import * as z from "zod";

export const TermRecallInputSchema = z.object({
  text: z.string(),
  sourceLanguageId: z.string(),
  translationLanguageId: z.string(),
  glossaryIds: z.array(z.uuidv4()).default([]),
  wordSimilarityThreshold: z.number().min(0).max(1).default(0.3),
});

export const TermContextSchema = z.object({
  term: z.string(),
  translation: z.string(),
  confidence: z.number(),
  definition: z.string().nullable(),
  concept: z.object({
    subjects: z.array(
      z.object({
        name: z.string(),
        defaultDefinition: z.string().nullable(),
      }),
    ),
    definition: z.string().nullable(),
  }),
});

export const TermRecallOutputSchema = z.object({
  terms: z.array(TermContextSchema),
});

export type TermRecallInput = z.infer<typeof TermRecallInputSchema>;
export type TermContext = z.infer<typeof TermContextSchema>;
export type TermRecallOutput = z.infer<typeof TermRecallOutputSchema>;

export const termRecallOp = async (
  data: TermRecallInput,
  _ctx?: OperationContext,
): Promise<TermRecallOutput> => {
  const { client: drizzle } = await getDbHandle();

  const lookedUpTerms = await executeQuery(
    { db: drizzle },
    listLexicalTermSuggestions,
    {
      text: data.text,
      sourceLanguageId: data.sourceLanguageId,
      translationLanguageId: data.translationLanguageId,
      glossaryIds: data.glossaryIds,
      wordSimilarityThreshold: data.wordSimilarityThreshold,
    },
  );

  const uniqueConceptIds = [...new Set(lookedUpTerms.map((t) => t.conceptId))];
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

  const terms = lookedUpTerms.map((t) => ({
    term: t.term,
    translation: t.translation,
    confidence: t.confidence,
    definition: t.definition,
    concept: {
      subjects: subjectsMap.get(t.conceptId) ?? [],
      definition: t.definition,
    },
  }));

  return { terms };
};
