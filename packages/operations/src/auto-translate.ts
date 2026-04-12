import type { OperationContext } from "@cat/domain";
import type { JSONObject } from "@cat/shared/schema/json";

import { z } from "zod";

import { collectMemoryRecallOp } from "./collect-memory-recall";
import { createTranslationOp } from "./create-translation";
import { fetchAdviseOp } from "./fetch-advise";

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
  documentId: z.uuidv4(),
});

export const AutoTranslateOutputSchema = z.object({
  translationIds: z.array(z.int()).optional(),
});

export type AutoTranslateInput = z.infer<typeof AutoTranslateInputSchema>;
export type AutoTranslateOutput = z.infer<typeof AutoTranslateOutputSchema>;

/**
 * @zh 自动翻译。
 *
 * 并行获取机器翻译建议与翻译记忆，根据决策逻辑选择最佳翻译并创建翻译记录。
 * 优先级：翻译记忆 > 机器翻译建议。若两者均无结果，则直接返回 `{}`。
 * @en Auto-translate a translatable element.
 *
 * Fetches machine-translation suggestions and memory matches in parallel,
 * then applies a priority rule to pick the best candidate and create a
 * translation record. Priority: memory > MT suggestion.
 * Returns `{}` when no candidate is available.
 *
 * @param data - {@zh 自动翻译输入参数} {@en Auto-translation input parameters}
 * @param ctx - {@zh 操作上下文} {@en Operation context}
 * @returns - {@zh 成功创建的翻译记录 ID 列表，无匹配时为空} {@en List of created translation IDs, empty when no match was found}
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
        memoryIds: data.memoryIds,
      },
      ctx,
    ),
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
    ),
  ]);

  const memory = memoryResult.sort((a, b) => b.confidence - a.confidence).at(0);

  const suggestion = adviseResult.suggestions
    .sort((a, b) => b.confidence - a.confidence)
    .at(0);

  // 决策逻辑
  let selectedText: string | undefined;
  let meta: JSONObject = {};

  if (memory) {
    selectedText = memory.adaptedTranslation ?? memory.translation;
    meta = { memoryId: memory.id, confidence: memory.confidence };
  } else if (suggestion) {
    selectedText = suggestion.translation;
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
      documentId: data.documentId,
    },
    { traceId },
  );

  return {
    translationIds: taskResult.translationIds,
  };
};
