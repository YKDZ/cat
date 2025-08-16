import type { TermRelation, TranslatableElement } from "@cat/shared";
import type { TranslationSuggestion } from "@cat/shared";

export interface TranslationAdvisor {
  getId(): string;
  getName(): string;
  isEnabled(): boolean;
  canSuggest(
    element: TranslatableElement,
    languageFromId: string,
    languageToId: string,
  ): boolean;
  getSuggestions(
    element: TranslatableElement,
    termedValue: string,
    termRelations: Required<TermRelation>[],
    languageFromId: string,
    languageToId: string,
  ): Promise<TranslationSuggestion[]>;
}
