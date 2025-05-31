import { TranslatableElement } from "@cat/shared";
import { TranslationSuggestion } from "@cat/shared";

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
    languageFromId: string,
    languageToId: string,
  ): Promise<TranslationSuggestion[]>;
}
