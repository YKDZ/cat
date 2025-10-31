import type { TranslationSuggestion } from "@cat/shared/schema/misc";
import type { IPluginService } from "@/registry/plugin-registry.ts";

export interface TranslationAdvisor extends IPluginService {
  getName(): string;
  canSuggest(languageFromId: string, languageToId: string): boolean;
  getSuggestions(
    value: string,
    termedValue: string,
    terms: { term: string; translation: string }[],
    languageFromId: string,
    languageToId: string,
  ): Promise<TranslationSuggestion[]>;
}
