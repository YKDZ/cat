export interface TermMatcher {
  search(
    text: string,
    languageId: string,
  ): Promise<{ translationId: number; value: string }[]>;
}
