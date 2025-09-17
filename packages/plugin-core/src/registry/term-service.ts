import type { TermRelation } from "@cat/shared/schema/prisma/glossary";
import type { IPluginService } from "@/registry/plugin-registry.ts";

export interface TermFormatter {
  format(
    originalText: string,
    matches: {
      start: number;
      end: number;
      value: string;
      replacement: string;
    }[],
  ): string;
}

export interface TermIndexer {
  ensureIndex(languageId: string): Promise<void>;
  analyzeText(languageId: string, text: string): Promise<string[]>;
}

export interface TermMatcher {
  search(
    text: string,
    languageId: string,
  ): Promise<{ translationId: number; value: string }[]>;
}

export interface TermStore {
  insertTerm(relation: TermRelation): Promise<void>;
  insertTerms(...relations: TermRelation[]): Promise<void>;
  searchTerm(text: string, languageId: string): Promise<number[]>;
  termText(
    text: string,
    sourceLanguageId: string,
    targetLanguageId: string,
  ): Promise<{ translationIds: number[]; termedText: string }>;
  init(): Promise<void>;
}

export interface TermService extends IPluginService {
  termFormatter: TermFormatter;
  termIndexer: TermIndexer;
  termMatcher: TermMatcher;
  termStore: TermStore;
}
