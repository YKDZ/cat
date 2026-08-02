import type { OperationContext } from "@cat/domain";
import { ServiceImplementationReferenceSchema } from "@cat/shared";
import { z } from "zod";

import {
  collectMemoryRecallOp,
  getMemoryRecallCandidates,
} from "./collect-memory-recall.ts";
import { fetchAdviseOp } from "./fetch-advise.ts";

export const FetchBestTranslationCandidateInputSchema = z.object({
  text: z.string(),
  sourceLanguageId: z.string(),
  translationLanguageId: z.string(),
  advisor: ServiceImplementationReferenceSchema.optional(),
  memoryIds: z.array(z.uuid()).default([]),
  glossaryIds: z.array(z.uuid()).default([]),
  chunkIds: z.array(z.int()).default([]),
  minMemorySimilarity: z.number().min(0).max(1).default(0.72),
  maxMemoryAmount: z.int().min(0).default(3),
  memoryVectorStorage: ServiceImplementationReferenceSchema.optional(),
});

export const FetchBestTranslationCandidateOutputSchema = z
  .object({
    text: z.string(),
    confidence: z.number(),
    source: z.enum(["memory", "advisor"]),
    /** Present when source === "memory", for meta preservation in callers. */
    memoryId: z.uuid().optional(),
  })
  .nullable();

export type FetchBestTranslationCandidateInput = z.input<
  typeof FetchBestTranslationCandidateInputSchema
>;
export type FetchBestTranslationCandidateOutput = z.infer<
  typeof FetchBestTranslationCandidateOutputSchema
>;

/** Run advisor and memory recall, preferring the strongest memory candidate. */
export const fetchBestTranslationCandidateOp = async (
  rawData: FetchBestTranslationCandidateInput,
  ctx?: OperationContext,
): Promise<FetchBestTranslationCandidateOutput> => {
  const data = FetchBestTranslationCandidateInputSchema.parse(rawData);
  const [adviseResult, memoryResult] = await Promise.all([
    fetchAdviseOp(
      {
        text: data.text,
        sourceLanguageId: data.sourceLanguageId,
        translationLanguageId: data.translationLanguageId,
        advisor: data.advisor,
        glossaryIds: data.glossaryIds,
        memoryIds: data.memoryIds,
      },
      ctx,
    ).catch(() => ({ suggestions: [] })),
    collectMemoryRecallOp(
      {
        text: data.text,
        chunkIds: data.chunkIds,
        memoryIds: data.memoryIds,
        sourceLanguageId: data.sourceLanguageId,
        translationLanguageId: data.translationLanguageId,
        minSimilarity: data.minMemorySimilarity,
        maxAmount: data.maxMemoryAmount,
        vectorStorage: data.memoryVectorStorage,
      },
      ctx,
    ),
  ]);

  const topMemory = getMemoryRecallCandidates(memoryResult)
    .sort((a, b) => b.confidence - a.confidence)
    .at(0);

  if (topMemory) {
    return {
      text: topMemory.adaptedTranslation ?? topMemory.translation,
      confidence: topMemory.confidence,
      source: "memory",
      memoryId: topMemory.memoryId,
    };
  }

  const topSuggestion = adviseResult.suggestions
    .sort((a, b) => b.confidence - a.confidence)
    .at(0);

  if (topSuggestion) {
    return {
      text: topSuggestion.translation,
      confidence: topSuggestion.confidence,
      source: "advisor",
    };
  }

  return null;
};
