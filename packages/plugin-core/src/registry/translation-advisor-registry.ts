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

export class TranslationAdvisorRegistry {
  private static instance: TranslationAdvisorRegistry;
  private advisors: TranslationAdvisor[] = [];

  private constructor() {}

  public static getInstance(): TranslationAdvisorRegistry {
    if (!TranslationAdvisorRegistry.instance) {
      TranslationAdvisorRegistry.instance = new TranslationAdvisorRegistry();
    }
    return TranslationAdvisorRegistry.instance;
  }

  register(advisor: TranslationAdvisor) {
    this.advisors.push(advisor);
  }

  unregister(advisor: TranslationAdvisor) {
    this.advisors.splice(this.advisors.indexOf(advisor), 1);
  }

  getAdvisors(): TranslationAdvisor[] {
    return this.advisors;
  }

  getEnabledAdvisors(): TranslationAdvisor[] {
    return this.getAdvisors().filter((advisor) => advisor.isEnabled());
  }
}
