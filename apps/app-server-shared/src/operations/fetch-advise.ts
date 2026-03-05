import { PluginManager } from "@cat/plugin-core";
import { TranslationSuggestionSchema } from "@cat/shared/schema/misc";
import { logger } from "@cat/shared/utils";
import * as z from "zod";

import type { OperationContext } from "@/operations/types";

import { firstOrGivenService } from "@/utils";

import { lookupTermsOp } from "./lookup-terms";

export const FetchAdviseInputSchema = z.object({
  advisorId: z.int().optional().meta({
    description:
      "Plugin service ID of the TRANSLATION_ADVISOR to use. Omit to use the default.",
  }),
  text: z.string(),
  sourceLanguageId: z.string(),
  translationLanguageId: z.string(),

  glossaryIds: z.array(z.uuidv4()).default([]).meta({
    description:
      "UUIDs of glossaries to inject term context into the suggestion.",
  }),
  termExtractorId: z.int().optional().meta({
    description:
      "Plugin service ID of the TERM_EXTRACTOR to use for term spotting. Omit to use the default.",
  }),
  termRecognizerId: z.int().optional().meta({
    description:
      "Plugin service ID of the TERM_RECOGNIZER to use. Omit to use the default.",
  }),
});

export const FetchAdviseOutputSchema = z.object({
  suggestions: z.array(TranslationSuggestionSchema),
});

export type FetchAdviseInput = z.infer<typeof FetchAdviseInputSchema>;
export type FetchAdviseOutput = z.infer<typeof FetchAdviseOutputSchema>;

/**
 * 获取翻译建议
 *
 * 通过 TRANSLATION_ADVISOR 插件服务获取机器翻译建议，
 * 支持术语表上下文注入。
 */
export const fetchAdviseOp = async (
  data: FetchAdviseInput,
  _ctx?: OperationContext,
): Promise<FetchAdviseOutput> => {
  const pluginManager = PluginManager.get("GLOBAL", "");

  const terms = await lookupTermsOp({
    text: data.text,
    sourceLanguageId: data.sourceLanguageId,
    translationLanguageId: data.translationLanguageId,
    glossaryIds: data.glossaryIds,
  });

  const advisor = firstOrGivenService(
    pluginManager,
    "TRANSLATION_ADVISOR",
    data.advisorId,
  );

  if (!advisor) {
    logger.warn("WORKER", {
      msg: `Translation advisor service not found. No suggestion will be given.`,
    });
    return { suggestions: [] };
  }

  const suggestions = await advisor.service.getSuggestions({
    value: data.text,
    terms,
    languageFromId: data.sourceLanguageId,
    languageToId: data.translationLanguageId,
  });

  return { suggestions };
};
