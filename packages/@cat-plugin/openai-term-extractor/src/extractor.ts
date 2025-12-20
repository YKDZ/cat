import type { TermCandidate, TermExtractor } from "@cat/plugin-core";

export class Extractor implements TermExtractor {
  getId(): string {
    return "openai";
  }

  async extract(
    _text: string,
    _sourceLanguageId: string,
    _options?: { maxResults?: number },
  ): Promise<TermCandidate[]> {
    throw new Error("Method not implemented.");
  }
}
