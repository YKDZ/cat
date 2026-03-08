import type { PluginServiceType } from "@cat/shared/schema/drizzle/enum";
import type { JSONType } from "@cat/shared/schema/json";
import type { TranslationAdvise } from "@cat/shared/schema/plugin";

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

export abstract class TranslationAdvisor implements IPluginService {
  abstract getId(): string;
  getType(): PluginServiceType {
    return "TRANSLATION_ADVISOR";
  }
  abstract getDisplayName(): string;
  abstract advise(ctx: GetSuggestionsContext): Promise<TranslationAdvise[]>;
}
