import type { TranslationSuggestion } from "@cat/shared/schema/misc";
import type { IPluginService } from "@/services/service";
import type { PluginServiceType } from "@cat/shared/schema/drizzle/enum";

export type CanSuggestContext = {
  languageFromId: string;
  languageToId: string;
};

export type GetSuggestionsContext = {
  value: string;
  terms: { term: string; translation: string; subject: string | null }[];
  languageFromId: string;
  languageToId: string;
};

export abstract class TranslationAdvisor implements IPluginService {
  abstract getId(): string;
  getType(): PluginServiceType {
    return "TRANSLATION_ADVISOR";
  }
  abstract getName(): string;
  abstract canSuggest(ctx: CanSuggestContext): boolean;
  abstract getSuggestions(
    ctx: GetSuggestionsContext,
  ): Promise<TranslationSuggestion[]>;
}
