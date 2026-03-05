import type { JSONObject } from "@cat/shared/schema/json";

import { z } from "zod";

import type { OperationContext } from "@/operations/types";

import { createTranslationOp } from "@/operations/create-translation";
import { fetchAdviseOp } from "@/operations/fetch-advise";
import { searchMemoryOp } from "@/operations/search-memory";

export const AutoTranslateInputSchema = z.object({
  translatableElementId: z.int(),
  text: z.string(),
  translationLanguageId: z.string(),
  sourceLanguageId: z.string(),

  translatorId: z.uuidv4().nullable(),

  advisorId: z.int().optional(),
  memoryIds: z.array(z.uuidv4()).default([]),
  glossaryIds: z.array(z.uuidv4()).default([]),
  /**
   * text 的 embeddings 的 chunkIds
   */
  chunkIds: z.array(z.int()).default([]),

  minMemorySimilarity: z.number().min(0).max(1),
  maxMemoryAmount: z.int().min(0).default(3),
  memoryVectorStorageId: z.int(),
  translationVectorStorageId: z.int(),
  vectorizerId: z.int(),
});

export const AutoTranslateOutputSchema = z.object({
  translationIds: z.array(z.int()).optional(),
});

export type AutoTranslateInput = z.infer<typeof AutoTranslateInputSchema>;
export type AutoTranslateOutput = z.infer<typeof AutoTranslateOutputSchema>;

/**
 * 自动翻译
 *
 * 并行获取翻译建议和翻译记忆，根据决策逻辑选择最佳翻译并创建翻译记录。
 * 优先级：记忆 > 机器翻译建议
 */
export const autoTranslateOp = async (
  data: AutoTranslateInput,
  ctx?: OperationContext,
): Promise<AutoTranslateOutput> => {
  const traceId = ctx?.traceId ?? crypto.randomUUID();

  // 并行获取翻译建议和记忆搜索（原 dependencies 阶段）
  const [adviseResult, memoryResult] = await Promise.all([
    fetchAdviseOp(
      {
        text: data.text,
        sourceLanguageId: data.sourceLanguageId,
        translationLanguageId: data.translationLanguageId,
        advisorId: data.advisorId,
        glossaryIds: data.glossaryIds,
      },
      ctx,
    ),
    searchMemoryOp(
      {
        chunkIds: data.chunkIds,
        memoryIds: data.memoryIds,
        sourceLanguageId: data.sourceLanguageId,
        translationLanguageId: data.translationLanguageId,
        minSimilarity: data.minMemorySimilarity,
        maxAmount: data.maxMemoryAmount,
        vectorStorageId: data.memoryVectorStorageId,
      },
      ctx,
    ),
  ]);

  const memory = memoryResult.memories
    .sort((a, b) => b.confidence - a.confidence)
    .at(0);

  const suggestion = adviseResult.suggestions
    .filter((s) => s.status === "SUCCESS")
    .at(0);

  // 决策逻辑
  let selectedText: string | undefined;
  let meta: JSONObject = {};

  if (memory) {
    selectedText = memory.translation;
    meta = { memoryId: memory.id, confidence: memory.confidence };
  } else if (suggestion) {
    selectedText = suggestion.value;
    if (data.advisorId) meta = { advisorId: data.advisorId };
  }

  if (!selectedText) {
    return {};
  }

  // 创建翻译（直接调用 createTranslationOp）
  const taskResult = await createTranslationOp(
    {
      data: [
        {
          translatableElementId: data.translatableElementId,
          languageId: data.translationLanguageId,
          text: selectedText,
          meta,
        },
      ],
      // 自动翻译暂时不创建记忆
      memoryIds: [],
      translatorId: data.translatorId,
      vectorizerId: data.vectorizerId,
      vectorStorageId: data.translationVectorStorageId,
    },
    { traceId },
  );

  return {
    translationIds: taskResult.translationIds,
  };
};
