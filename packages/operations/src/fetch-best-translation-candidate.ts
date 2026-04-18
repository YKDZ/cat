import type { OperationContext } from "@cat/domain";

import { z } from "zod";

import { collectMemoryRecallOp } from "./collect-memory-recall";
import { fetchAdviseOp } from "./fetch-advise";

export const FetchBestTranslationCandidateInputSchema = z.object({
  text: z.string(),
  sourceLanguageId: z.string(),
  translationLanguageId: z.string(),
  advisorId: z.int().optional(),
  memoryIds: z.array(z.uuid()).default([]),
  glossaryIds: z.array(z.uuid()).default([]),
  chunkIds: z.array(z.int()).default([]),
  minMemorySimilarity: z.number().min(0).max(1).default(0.72),
  maxMemoryAmount: z.int().min(0).default(3),
  memoryVectorStorageId: z.int().optional(),
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

/**
 * @zh 获取最佳翻译候选：并行调用 fetchAdviseOp + collectMemoryRecallOp，
 * 按 confidence 排序选出最优候选。memory > advisor。
 * 单个 provider 失败时静默降级，不影响另一方结果。
 * @en Fetch the best translation candidate by running advisor + memory recall
 * in parallel and picking the highest-confidence result. Memory > advisor.
 * Individual provider failures are silently suppressed.
 */
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
        advisorId: data.advisorId,
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
        vectorStorageId: data.memoryVectorStorageId,
      },
      ctx,
    ).catch(() => []),
  ]);

  const topMemory = memoryResult
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
