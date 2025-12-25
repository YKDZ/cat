import type { TranslationSuggestion } from "@cat/shared/schema/misc";
import type { IPluginService } from "@/services/service";
import type { PluginServiceType } from "@cat/shared/schema/drizzle/enum";

export abstract class TranslationAdvisor implements IPluginService {
  abstract getId(): string;
  getType(): PluginServiceType {
    return "TRANSLATION_ADVISOR";
  }
  abstract getName(): string;
  abstract canSuggest(languageFromId: string, languageToId: string): boolean;
  abstract getSuggestions(
    value: string,
    termedValue: string,
    terms: { term: string; translation: string; subject: string | null }[],
    languageFromId: string,
    languageToId: string,
  ): Promise<TranslationSuggestion[]>;
}
