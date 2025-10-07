import type { TranslationSuggestion } from "@cat/shared/schema/misc";
import type { TermRelation } from "@cat/shared/schema/drizzle/glossary";
import type { IPluginService } from "@/registry/plugin-registry.ts";

export interface TranslationAdvisor extends IPluginService {
  getName(): string;
  canSuggest(languageFromId: string, languageToId: string): boolean;
  getSuggestions(
    value: string,
    termedValue: string,
    termRelations: Required<TermRelation>[],
    languageFromId: string,
    languageToId: string,
  ): Promise<TranslationSuggestion[]>;
}
