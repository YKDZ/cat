import type { TermCandidate, TermExtractor } from "@cat/plugin-core";
import type { PluginServiceType } from "@cat/shared/schema/drizzle/enum";

export class Extractor implements TermExtractor {
  getId(): string {
    return "openai";
  }

  getType(): PluginServiceType {
    return "TERM_EXTRACTOR";
  }

  async extract(
    _text: string,
    _sourceLanguageId: string,
    _options?: { maxResults?: number },
  ): Promise<TermCandidate[]> {
    throw new Error("Method not implemented.");
  }
}
