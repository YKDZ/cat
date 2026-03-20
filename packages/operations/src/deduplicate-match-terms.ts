import type { OperationContext } from "@cat/domain";

import { getDbHandle } from "@cat/domain";
import { executeQuery, listLexicalTermSuggestions } from "@cat/domain";
import * as z from "zod";

export const DeduplicateAndMatchInputSchema = z.object({
  candidates: z.array(
    z.object({
      text: z.string(),
      normalizedText: z.string(),
      posPattern: z.array(z.string()),
      confidence: z.number().min(0).max(1),
      frequency: z.int(),
      documentFrequency: z.int(),
      source: z.enum(["statistical", "llm", "both"]).default("statistical"),
      occurrences: z.array(
        z.object({
          elementId: z.int(),
          ranges: z.array(z.object({ start: z.int(), end: z.int() })),
        }),
      ),
    }),
  ),
  glossaryId: z.uuidv4(),
  sourceLanguageId: z.string().min(1),
});

export const DeduplicateAndMatchOutputSchema = z.object({
  candidates: z.array(
    z.object({
      text: z.string(),
      normalizedText: z.string(),
      posPattern: z.array(z.string()),
      confidence: z.number().min(0).max(1),
      frequency: z.int(),
      documentFrequency: z.int(),
      source: z.enum(["statistical", "llm", "both"]),
      existsInGlossary: z.boolean(),
      existingConceptId: z.int().nullable(),
      occurrences: z.array(
        z.object({
          elementId: z.int(),
          ranges: z.array(z.object({ start: z.int(), end: z.int() })),
        }),
      ),
    }),
  ),
});

export type DeduplicateAndMatchInput = z.infer<
  typeof DeduplicateAndMatchInputSchema
>;
export type DeduplicateAndMatchOutput = z.infer<
  typeof DeduplicateAndMatchOutputSchema
>;

/**
 * 去重 & 与现有术语库比对
 *
 * 1. 以 normalizedText (lemma) 为聚合键对候选进行归一化去重
 * 2. 用 listLexicalTermSuggestions (pg_trgm word_similarity) 批量比对现有术语库
 * 3. 标记已存在的术语
 */
export const deduplicateAndMatchOp = async (
  data: DeduplicateAndMatchInput,
  _ctx?: OperationContext,
): Promise<DeduplicateAndMatchOutput> => {
  const { client: drizzle } = await getDbHandle();

  // Step 1: Deduplicate by normalizedText, keep highest confidence per key
  const deduped = new Map<string, (typeof data.candidates)[number]>();

  for (const candidate of data.candidates) {
    const existing = deduped.get(candidate.normalizedText);
    if (!existing || candidate.confidence > existing.confidence) {
      deduped.set(candidate.normalizedText, candidate);
    }
  }

  const uniqueCandidates = [...deduped.values()];

  if (uniqueCandidates.length === 0) {
    return { candidates: [] };
  }

  // Step 2: Batch compare against glossary using word_similarity (pg_trgm)
  // Run in parallel batches of ~50 candidates
  const BATCH_SIZE = 50;
  const glossaryMatchMap = new Map<string, number>(); // normalizedText → conceptId

  const batches: (typeof uniqueCandidates)[] = [];
  for (let i = 0; i < uniqueCandidates.length; i += BATCH_SIZE) {
    batches.push(uniqueCandidates.slice(i, i + BATCH_SIZE));
  }

  await Promise.all(
    batches.map(async (batch) => {
      return Promise.all(
        batch.map(async (candidate) => {
          const suggestions = await executeQuery(
            { db: drizzle },
            listLexicalTermSuggestions,
            {
              glossaryIds: [data.glossaryId],
              text: candidate.text,
              sourceLanguageId: data.sourceLanguageId,
              translationLanguageId: data.sourceLanguageId,
              wordSimilarityThreshold: 0.8,
            },
          );
          if (suggestions.length > 0 && suggestions[0]) {
            glossaryMatchMap.set(
              candidate.normalizedText,
              suggestions[0].conceptId,
            );
          }
        }),
      );
    }),
  );

  // Step 3: Build output with match annotations
  const candidates = uniqueCandidates.map((candidate) => {
    const existingConceptId =
      glossaryMatchMap.get(candidate.normalizedText) ?? null;
    return {
      text: candidate.text,
      normalizedText: candidate.normalizedText,
      posPattern: candidate.posPattern,
      confidence: candidate.confidence,
      frequency: candidate.frequency,
      documentFrequency: candidate.documentFrequency,
      source: candidate.source,
      existsInGlossary: existingConceptId !== null,
      existingConceptId,
      occurrences: candidate.occurrences,
    };
  });

  return { candidates };
};
