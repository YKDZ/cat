import type { TermCandidate, TermExtractor } from "@cat/plugin-core";
import * as z from "zod/v4";

export class Extractor implements TermExtractor {
  getId(): string {
    return "openai";
  }

  extract(
    text: string,
    sourceLanguageId: string,
    options?: { maxResults?: number },
  ): Promise<TermCandidate[]> {
    throw new Error("Method not implemented.");
  }
}
