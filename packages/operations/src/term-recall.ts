import type { OperationContext } from "@cat/domain";

import {
  executeQuery,
  getDbHandle,
  listConceptSubjectsByConceptIds,
} from "@cat/domain";
import { EnrichedTermMatchSchema } from "@cat/shared/schema/term-recall";
import * as z from "zod";

import { collectTermRecallOp } from "./collect-term-recall";

export const TermRecallInputSchema = z.object({
  text: z.string(),
  sourceLanguageId: z.string(),
  translationLanguageId: z.string(),
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

/**
 * @zh 术语记忆回射。
 *
 * 根据源文本和词汇表 ID，通过 ILIKE + word_similarity 查找匹配术语，
 * 并丰富每个术语的概念主题信息。
 * @en Term recall.
 *
 * Given a source text and glossary IDs, finds matching terms via ILIKE +
 * word_similarity, then enriches each match with its concept subject
 * information.
 *
 * @param data - {@zh 术语回射输入参数} {@en Term recall input parameters}
 * @param _ctx - {@zh 操作上下文（未使用）} {@en Operation context (unused)}
 * @returns - {@zh 丰富了指向概念主题的术语匹配列表} {@en Term matches enriched with concept subject information}
 */
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
