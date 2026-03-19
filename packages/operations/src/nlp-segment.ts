import type { OperationContext } from "@cat/domain";
import type { NlpSegmentResult } from "@cat/shared/schema/nlp";

import { firstOrGivenService, resolvePluginManager } from "@cat/server-shared";
import { NlpSegmentResultSchema } from "@cat/shared/schema/nlp";
import * as z from "zod";

import { intlSegmenterFallback } from "./nlp-intl-fallback";

export const NlpSegmentInputSchema = z.object({
  nlpSegmenterId: z.int().optional().meta({
    description:
      "Plugin service ID of the NLP_WORD_SEGMENTER to use. Omit to use the default.",
  }),
  text: z.string(),
  languageId: z.string(),
});

export const NlpSegmentOutputSchema = NlpSegmentResultSchema;

export type NlpSegmentInput = z.infer<typeof NlpSegmentInputSchema>;
export type NlpSegmentOutput = NlpSegmentResult;

/**
 * 单文本 NLP 分词
 *
 * 通过 NLP_WORD_SEGMENTER 插件服务进行语言学分词。
 * 当没有可用的 NLP_WORD_SEGMENTER 插件时，自动回退到内置 Intl.Segmenter。
 */
export const nlpSegmentOp = async (
  data: NlpSegmentInput,
  ctx?: OperationContext,
): Promise<NlpSegmentOutput> => {
  const pluginManager = resolvePluginManager(ctx?.pluginManager);
  const segmenter = firstOrGivenService(
    pluginManager,
    "NLP_WORD_SEGMENTER",
    data.nlpSegmenterId,
  );

  if (!segmenter) {
    return intlSegmenterFallback(data.text, data.languageId);
  }

  return segmenter.service.segment({
    text: data.text,
    languageId: data.languageId,
    signal: ctx?.signal,
  });
};
