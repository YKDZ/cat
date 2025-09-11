import type { TranslationSuggestion } from "@cat/shared/schema/misc";
import type { TranslatableElement } from "@cat/shared/schema/prisma/document";
import type { TermRelation } from "@cat/shared/schema/prisma/glossary";

export interface TranslationAdvisor {
  getId(): string;
  getName(): string;
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
