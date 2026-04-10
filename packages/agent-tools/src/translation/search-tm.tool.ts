import type { AgentToolDefinition } from "@cat/agent";

import { streamSearchMemoryOp } from "@cat/operations";
import * as z from "zod/v4";

const searchTmArgs = z.object({
  /**
   * @zh 源文本
   * @en Source text to search TM for
   */
  text: z.string().describe("Source text to search translation memory for"),
  /**
   * @zh 源语言 ID（BCP-47）
   * @en Source language ID (BCP-47)
   */
  sourceLanguageId: z.string().describe("Source language ID (BCP-47)"),
  /**
   * @zh 目标语言 ID（BCP-47）
   * @en Target language ID (BCP-47)
   */
  translationLanguageId: z.string().describe("Target language ID (BCP-47)"),
  /**
   * @zh 翻译记忆库 UUID 列表
   * @en Translation memory bank UUIDs to search
   */
  memoryIds: z
    .array(z.uuid())
    .default([])
    .describe("Translation memory bank UUIDs"),
  /**
   * @zh 最低相似度阈值（0–1，默认 0.72）
   * @en Minimum similarity threshold (0–1, default 0.72)
   */
  minSimilarity: z
    .number()
    .min(0)
    .max(1)
    .default(0.72)
    .describe("Minimum cosine similarity threshold (0–1)"),
  /**
   * @zh 最多返回条数（默认 5）
   * @en Maximum number of matches to return (default 5)
   */
  maxAmount: z
    .int()
    .min(1)
    .default(5)
    .describe("Maximum number of TM matches to return"),
});

/**
 * @zh search_tm 工具: 在翻译记忆库中通过三通道（精确、trgm、向量语义）搜索匹配项。
 * @en search_tm tool: search translation memory banks via three channels (exact, trgm, vector semantic).
 */
export const searchTmTool: AgentToolDefinition = {
  name: "search_tm",
  description:
    "Search translation memory banks for existing translations of the source text. Uses three-channel matching (exact, trigram similarity, vector semantic). Returns ranked matches with source text, translation, and confidence scores.",
  parameters: searchTmArgs,
  sideEffectType: "none",
  toolSecurityLevel: "standard",
  async execute(args, _ctx) {
    const parsed = searchTmArgs.parse(args);
    const memories: Array<{
      source: string;
      translation: string;
      confidence: number;
      memoryId: string;
    }> = [];
    for await (const match of streamSearchMemoryOp({
      text: parsed.text,
      sourceLanguageId: parsed.sourceLanguageId,
      translationLanguageId: parsed.translationLanguageId,
      memoryIds: parsed.memoryIds,
      chunkIds: [],
      minSimilarity: parsed.minSimilarity,
      maxAmount: parsed.maxAmount,
    })) {
      memories.push({
        source: match.source,
        translation: match.adaptedTranslation ?? match.translation,
        confidence: match.confidence,
        memoryId: match.memoryId,
      });
    }
    return { memories };
  },
};
