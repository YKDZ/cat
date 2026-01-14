import { defineWorkflow } from "@/core";
import { z } from "zod";
import { fetchAdviseWorkflow } from "./fetch-advise";
import { searchMemoryWorkflow } from "./search-memory";
import { createTranslationWorkflow } from "./create-translation";
import type { JSONObject } from "@cat/shared/schema/json";

export const AutoTranslateInputSchema = z.object({
  translatableElementId: z.int(),
  text: z.string(),
  translationLanguageId: z.string(),
  sourceLanguageId: z.string(),

  advisorId: z.int().optional(),
  memoryIds: z.array(z.uuidv4()).default([]),
  glossaryIds: z.array(z.uuidv4()).default([]),
  /**
   * text 的 embeddings 的 chunkIds
   */
  chunkIds: z.array(z.int()).default([]),

  minMemorySimilarity: z.number().min(0).max(1),
  /**
   * 用记忆作为翻译源时最多查找多少记忆
   */
  maxMemoryAmount: z.int().min(0).default(3),
  /**
   * 查找记忆时提供 cosine 距离计算的向量存储
   */
  memoryVectorStorageId: z.int(),
  /**
   * 查找记忆时提供 cosine 距离计算的向量存储
   */
  translationVectorStorageId: z.int(),
  /**
   * 创建翻译时用的向量化器
   */
  vectorizerId: z.int(),
});

export const AutoTranslateOutputSchema = z.object({
  translationIds: z.array(z.int()).optional(),
});

/**
 * 利用利用以及与机器翻译自动翻译给定的 text
 */
export const autoTranslateWorkflow = await defineWorkflow({
  name: "auto-translate",
  input: AutoTranslateInputSchema,
  output: AutoTranslateOutputSchema,

  dependencies: async (data, { traceId }) => [
    await fetchAdviseWorkflow.asChild(
      {
        text: data.text,
        sourceLanguageId: data.sourceLanguageId,
        translationLanguageId: data.translationLanguageId,
        advisorId: data.advisorId,
        glossaryIds: data.glossaryIds,
      },
      { traceId },
    ),
    await searchMemoryWorkflow.asChild(
      {
        chunkIds: data.chunkIds,
        memoryIds: data.memoryIds,
        sourceLanguageId: data.sourceLanguageId,
        translationLanguageId: data.translationLanguageId,
        minSimilarity: data.minMemorySimilarity,
        maxAmount: data.maxMemoryAmount,
        vectorStorageId: data.memoryVectorStorageId,
      },
      { traceId },
    ),
  ],

  handler: async (data, { getTaskResult, traceId }) => {
    // 获取并行任务的结果
    const [adviseResult] = getTaskResult(fetchAdviseWorkflow);
    const [memoryResult] = getTaskResult(searchMemoryWorkflow);

    const memory = memoryResult?.memories
      .sort((a, b) => b.similarity - a.similarity)
      .at(0);

    const suggestion = adviseResult?.suggestions
      .filter((s) => s.status === "SUCCESS")
      .at(0);

    // 决策逻辑
    let selectedText: string | undefined;
    let meta: JSONObject = {};
    let strategy: "MEMORY" | "ADVISOR" | "NONE" = "NONE";

    if (memory) {
      selectedText = memory.translation;
      meta = { memoryId: memory.id, similarity: memory.similarity };
      strategy = "MEMORY";
    } else if (suggestion) {
      selectedText = suggestion.value;
      if (data.advisorId) meta = { advisorId: data.advisorId };
      strategy = "ADVISOR";
    }

    if (!selectedText) {
      return { success: false, strategy };
    }

    // 创建翻译
    const { result } = await createTranslationWorkflow.run(
      {
        data: [
          {
            translatableElementId: data.translatableElementId,
            languageId: data.translationLanguageId,
            text: selectedText,
            meta,
          },
        ],
        // TODO 自动翻译暂时不创建记忆
        memoryIds: [],
        vectorizerId: data.vectorizerId,
        vectorStorageId: data.translationVectorStorageId,
      },
      { traceId },
    );

    const taskResult = await result();

    return {
      translationIds: taskResult.translationIds,
    };
  },
});
