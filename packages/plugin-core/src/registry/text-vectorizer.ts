import type { UnvectorizedTextData } from "@cat/shared/schema/misc";

export interface TextVectorizer {
  getId(): string;
  canVectorize(languageId: string): boolean;
  vectorize(
    languageId: string,
    elements: UnvectorizedTextData[],
  ): Promise<number[][]>;
}
