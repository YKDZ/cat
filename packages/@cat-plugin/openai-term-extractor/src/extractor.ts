import {
  TermExtractor,
  type ExtractContext,
  type TermCandidate,
} from "@cat/plugin-core";

export class Extractor extends TermExtractor {
  getId(): string {
    return "openai";
  }

  async extract(_ctx: ExtractContext): Promise<TermCandidate[]> {
    throw new Error("Method not implemented.");
  }
}
