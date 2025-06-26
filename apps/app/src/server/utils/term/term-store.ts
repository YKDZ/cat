import type { TermRelation } from "@cat/shared";

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
