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
