import { UnvectorizedTextData } from "@cat/shared";

export interface TextVectorizer {
  getId(): string;
  canVectorize(languageId: string): boolean;
  vectorize(
    languageId: string,
    elements: UnvectorizedTextData[],
  ): Promise<number[][]>;
}

export class TextVectorizerRegistry {
  private static instance: TextVectorizerRegistry;
  private vectorizers: TextVectorizer[] = [];

  private constructor() {}

  public static getInstance(): TextVectorizerRegistry {
    if (!TextVectorizerRegistry.instance) {
      TextVectorizerRegistry.instance = new TextVectorizerRegistry();
    }
    return TextVectorizerRegistry.instance;
  }

  register(vectorizer: TextVectorizer) {
    this.vectorizers.push(vectorizer);
  }

  unregister(vectorizer: TextVectorizer) {
    this.vectorizers.splice(this.vectorizers.indexOf(vectorizer), 1);
  }

  getVectorizers() {
    return this.vectorizers;
  }
}
