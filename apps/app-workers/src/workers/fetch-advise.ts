import { defineWorkflow } from "@/core";
import { firstOrGivenService, lookupTerms } from "@cat/app-server-shared/utils";
import { getDrizzleDB } from "@cat/db";
import { PluginManager } from "@cat/plugin-core";
import { TranslationSuggestionSchema } from "@cat/shared/schema/misc";
import * as z from "zod";
import { logger } from "@cat/shared/utils";

export const FetchAdviseInputSchema = z.object({
  advisorId: z.number().optional(),
  text: z.string(),
  sourceLanguageId: z.string(),
  translationLanguageId: z.string(),

  glossaryIds: z.array(z.uuidv4()).default([]),
  termExtractorId: z.int().optional(),
  termRecognizerId: z.int().optional(),
});

export const FetchAdviseOutputSchema = z.object({
  suggestions: z.array(TranslationSuggestionSchema),
});

export const fetchAdviseWorkflow = await defineWorkflow({
  name: "advise.fetch",
  input: FetchAdviseInputSchema,
  output: FetchAdviseOutputSchema,

  dependencies: async () => [],

  handler: async (data) => {
    const { client: drizzle } = await getDrizzleDB();
    const pluginManager = PluginManager.get("GLOBAL", "");

    const terms = await lookupTerms(drizzle, {
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
      logger.warn("PROCESSOR", {
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
  },
});
