import type { UnvectorizedTextData } from "@cat/shared";

export interface TextVectorizer {
  getId(): string;
  canVectorize(languageId: string): boolean;
  vectorize(
    languageId: string,
    elements: UnvectorizedTextData[],
  ): Promise<number[][]>;
}
