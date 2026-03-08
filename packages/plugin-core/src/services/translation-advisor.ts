import type { PluginServiceType } from "@cat/shared/schema/drizzle/enum";
import type { JSONType } from "@cat/shared/schema/json";

import z from "zod";

import type { IPluginService } from "@/services/service";

export type GetSuggestionsContext = {
  source: {
    text: string;
    languageId: string;
    meta: JSONType;
  };
  terms: {
    term: string;
    translation: string;
    concept: {
      subjects: {
        name: string;
        defaultDefinition: string | null;
      }[];
      definition: string | null;
    };
    confidence: number;
  }[];
  memories: {
    source: string;
    translation: string;
    confidence: number;
  }[];
  targetLanguageId: string;
};

export const TranslationSuggestionSchema = z.object({
  translation: z.string(),
  confidence: z.number().min(0).max(1),
});

export type TranslationSuggestion = z.infer<typeof TranslationSuggestionSchema>;

export abstract class TranslationAdvisor implements IPluginService {
  abstract getId(): string;
  getType(): PluginServiceType {
    return "TRANSLATION_ADVISOR";
  }
  abstract getName(): string;
  abstract getSuggestions(
    ctx: GetSuggestionsContext,
  ): Promise<TranslationSuggestion[]>;
}
