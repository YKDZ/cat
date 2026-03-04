import { PluginManager } from "@cat/plugin-core";
import { logger } from "@cat/shared/utils";
import * as z from "zod";

import type { OperationContext } from "@/operations/types";

import { firstOrGivenService } from "@/utils";

const TermCandidateSchema = z.object({
  text: z.string(),
  normalizedText: z.string(),
  range: z.array(z.object({ start: z.int(), end: z.int() })),
  meta: z.unknown().optional(),
});

export const SpotTermInputSchema = z.object({
  termExtractorId: z.int().optional().meta({
    description:
      "Plugin service ID of the TERM_EXTRACTOR to use. Omit to use the default.",
  }),
  text: z.string(),
  languageId: z.string(),
});

export const SpotTermOutputSchema = z.object({
  candidates: z.array(TermCandidateSchema),
});

export type SpotTermInput = z.infer<typeof SpotTermInputSchema>;
export type SpotTermOutput = z.infer<typeof SpotTermOutputSchema>;

/**
 * 术语候选发现
 *
 * 使用 TERM_EXTRACTOR 插件从文本中识别潜在的术语候选项。
 * 这是纯粹的"发现"阶段，不涉及术语表匹配或向量搜索。
 *
 * @see recognizeTermOp — 基于向量相似度的术语匹配
 * @see lookupTerms — 快速词汇术语查找
 */
export const spotTermOp = async (
  data: SpotTermInput,
  _ctx?: OperationContext,
): Promise<SpotTermOutput> => {
  const pluginManager = PluginManager.get("GLOBAL", "");

  const termExtractor = firstOrGivenService(
    pluginManager,
    "TERM_EXTRACTOR",
    data.termExtractorId,
  );

  if (!termExtractor) {
    logger.warn("WORKER", {
      msg: "Term extractor service not found.",
    });
    return { candidates: [] };
  }

  const candidates = await termExtractor.service.extract({
    text: data.text,
    languageId: data.languageId,
    signal: _ctx?.signal,
  });

  return { candidates };
};
