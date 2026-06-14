import type { OperationContext } from "@cat/domain";

import { firstOrGivenService, resolvePluginManager } from "@cat/server-shared";
import {
  NlpBatchSegmentResultSchema,
  NlpSegmentResultSchema,
} from "@cat/shared";
import * as z from "zod";

import { intlSegmenterFallback } from "./nlp-intl-fallback";

export const NlpBatchSegmentInputSchema = z.object({
  nlpSegmenterId: z.int().optional().meta({
    description:
      "Plugin service ID of the NLP_WORD_SEGMENTER to use. Omit to use the default.",
  }),
  items: z.array(
    z.object({
      id: z.string(),
      text: z.string(),
    }),
  ),
  languageId: z.string(),
});

export const NlpBatchSegmentOutputSchema = NlpBatchSegmentResultSchema;

export type NlpBatchSegmentInput = z.infer<typeof NlpBatchSegmentInputSchema>;
export type NlpBatchSegmentOutput = z.infer<typeof NlpBatchSegmentOutputSchema>;

/**
 *
 * 通过 NLP_WORD_SEGMENTER 插件服务批量进行语言学分词。
 * 当没有可用的 NLP_WORD_SEGMENTER 插件时，自动回退到内置 Intl.Segmenter 逐条处理。
 * Batch NLP segmentation of texts.
 *
 * Performs linguistic word segmentation in batch mode via the
 * NLP_WORD_SEGMENTER plugin service. When no plugin is available,
 * automatically falls back to the built-in Intl.Segmenter, processing
 * items one by one.
 *
 * @param data - Batch segmentation input parameters
 * @param ctx - Operation context
 * @returns - Per-item segmentation results containing sentence and token lists
 */
export const nlpBatchSegmentOp = async (
  data: NlpBatchSegmentInput,
  ctx?: OperationContext,
): Promise<NlpBatchSegmentOutput> => {
  const pluginManager = resolvePluginManager(ctx?.pluginManager);
  const segmenter = firstOrGivenService(
    pluginManager,
    "NLP_WORD_SEGMENTER",
    data.nlpSegmenterId,
  );

  if (!segmenter) {
    const results = data.items.map((item) => ({
      id: item.id,
      result: intlSegmenterFallback(item.text, data.languageId),
    }));
    return { results };
  }

  return segmenter.service.batchSegment({
    items: data.items,
    languageId: data.languageId,
    signal: ctx?.signal,
  });
};

export { NlpSegmentResultSchema };
