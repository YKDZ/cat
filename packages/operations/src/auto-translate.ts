import type { OperationContext } from "@cat/domain";
import type { JSONObject } from "@cat/shared/schema/json";

import { z } from "zod";

import { createTranslationOp } from "./create-translation";
import { fetchBestTranslationCandidateOp } from "./fetch-best-translation-candidate";

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

  const candidate = await fetchBestTranslationCandidateOp(
    {
      text: data.text,
      sourceLanguageId: data.sourceLanguageId,
      translationLanguageId: data.translationLanguageId,
      advisorId: data.advisorId,
      memoryIds: data.memoryIds,
      glossaryIds: data.glossaryIds,
      chunkIds: data.chunkIds,
      minMemorySimilarity: data.minMemorySimilarity,
      maxMemoryAmount: data.maxMemoryAmount,
      memoryVectorStorageId: data.memoryVectorStorageId,
    },
    ctx,
  );

  if (!candidate) {
    return {};
  }

  let meta: JSONObject = {};
  if (candidate.source === "memory") {
    meta = {
      ...(candidate.memoryId ? { memoryId: candidate.memoryId } : {}),
      confidence: candidate.confidence,
    };
  } else if (data.advisorId) {
    meta = { advisorId: data.advisorId };
  }

  const taskResult = await createTranslationOp(
    {
      data: [
        {
          translatableElementId: data.translatableElementId,
          languageId: data.translationLanguageId,
          text: candidate.text,
          meta,
        },
      ],
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
