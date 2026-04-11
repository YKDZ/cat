import type { AgentToolDefinition } from "@cat/agent";

import { termRecallOp } from "@cat/operations";
import * as z from "zod/v4";

const searchTermbaseArgs = z.object({
  /**
   * @zh 源文本（用于术语识别）
   * @en Source text (used for term matching)
   */
  text: z.string().describe("Source text to search termbase for"),
  /**
   * @zh 源语言 ID（BCP-47）
   * @en Source language ID (BCP-47)
   */
  sourceLanguageId: z
    .string()
    .optional()
    .describe("Source language ID (BCP-47)"),
  /**
   * @zh 目标语言 ID（BCP-47）
   * @en Target language ID (BCP-47)
   */
  translationLanguageId: z
    .string()
    .optional()
    .describe("Target language ID (BCP-47)"),
  /**
   * @zh 术语表 UUID 列表
   * @en Glossary UUIDs to search
   */
  glossaryIds: z
    .array(z.uuid())
    .default([])
    .describe("Glossary UUIDs to search"),
  /**
   * @zh 词语相似度阈值（0-1，默认 0.3）
   * @en Word similarity threshold (0–1, default 0.3)
   */
  wordSimilarityThreshold: z
    .number()
    .min(0)
    .max(1)
    .default(0.3)
    .describe("Word similarity threshold (0–1)"),
});

/**
 * @zh search_termbase 工具: 在术语库中搜索源文本的相关术语。
 * @en search_termbase tool: search the termbase for terms occurring in the source text.
 */
export const searchTermbaseTool: AgentToolDefinition = {
  name: "search_termbase",
  description:
    "Search the termbase for terms found in the source text. Returns matched terms with their translations and definitions.",
  parameters: searchTermbaseArgs,
  sideEffectType: "none",
  toolSecurityLevel: "standard",
  async execute(args, ctx) {
    const parsed = searchTermbaseArgs.parse(args);
    const sourceLanguageId =
      parsed.sourceLanguageId ?? ctx.session.sourceLanguageId;
    const translationLanguageId =
      parsed.translationLanguageId ?? ctx.session.languageId;

    if (!sourceLanguageId || !translationLanguageId) {
      throw new Error(
        "search_termbase requires sourceLanguageId and translationLanguageId",
      );
    }

    const result = await termRecallOp({
      text: parsed.text,
      sourceLanguageId,
      translationLanguageId,
      glossaryIds: parsed.glossaryIds,
      wordSimilarityThreshold: parsed.wordSimilarityThreshold,
    });
    return { terms: result.terms };
  },
};
