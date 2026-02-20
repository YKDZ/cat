import {
  TermExtractor,
  TermRecognizer,
  TermAligner,
  ExtractContext,
  RecognizeContext,
  AlignContext,
  TermCandidate,
  RecognizedTermEntry,
  TermPairCandidate,
} from "@cat/plugin-core";
import OpenAI from "openai";
import { z } from "zod";

const ConfigSchema = z.object({
  apiKey: z.string().optional(),
  baseURL: z.string().optional(),
  model: z.string().optional().default("gpt-4o"),
  extractionPrompt: z.string(),
  alignmentPrompt: z.string(),
});

type Config = z.infer<typeof ConfigSchema>;

class BaseService {
  public openai: OpenAI; // Made public for direct access by subclasses
  public model: string;
  public config: Config;

  constructor(config: unknown) {
    this.config = ConfigSchema.parse(config);
    this.model = this.config.model;

    // Safely initialize OpenAI or create a dummy client that fails on request
    const apiKey = this.config.apiKey || "dummy-key";
    // If we use a dummy key, requests will fail with 401, which is better than crashing on startup

    this.openai = new OpenAI({
      apiKey,
      baseURL: this.config.baseURL,
    });
  }
}

export class OpenAITermExtractor extends TermExtractor {
  private base: BaseService;

  constructor(config: unknown) {
    super();
    this.base = new BaseService(config);
  }

  getId(): string {
    return "openai-term-extractor";
  }

  async extract(ctx: ExtractContext): Promise<TermCandidate[]> {
    // Use user configured prompt if available, interpolating variables.
    // Simple variable interpolation replacement.
    const prompt = this.base.config.extractionPrompt
      .replace("{{text}}", ctx.text)
      .replace("{{languageId}}", ctx.languageId);

    const completion = await this.base.openai.chat.completions.create({
      model: this.base.model,
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
    });

    const content = completion.choices[0].message.content;
    if (!content) return [];

    try {
      const parsed = JSON.parse(content);
      const candidates = (parsed.terms || parsed.candidates || parsed) as any[];
      if (!Array.isArray(candidates)) return [];

      // Naive range finding (LLM doesn't give ranges reliably unless asked specifically, which is hard)
      // So we search for the text in the original string.
      const result: TermCandidate[] = [];
      for (const item of candidates) {
        if (!item.text) continue;
        const text = item.text;
        const normalized = item.normalizedText || text;

        // Find ranges
        const ranges: { start: number; end: number }[] = [];
        let pos = ctx.text.indexOf(text);
        while (pos !== -1) {
          ranges.push({ start: pos, end: pos + text.length });
          pos = ctx.text.indexOf(text, pos + 1);
        }

        if (ranges.length > 0) {
          result.push({
            text,
            normalizedText: normalized,
            range: ranges,
          });
        }
      }
      return result;
    } catch (e) {
      console.error("Failed to parse extraction result", e);
      return [];
    }
  }
}

export class OpenAITermRecognizer extends TermRecognizer {
  constructor(_config: unknown) {
    super();
  }

  getId(): string {
    return "openai-term-recognizer";
  }

  async recognize(_ctx: RecognizeContext): Promise<RecognizedTermEntry[]> {
    // The previous implementation required glossaryCandidates which are no longer part of the interface.
    // This recognizer needs to include a search step (e.g. vector or keyword) before calling LLM.
    // For now, we return empty as this requires a larger refactor to support DB/Search access.
    console.warn(
      "OpenAITermRecognizer: recognize() requires access to glossary which is not yet implemented in this version. Returning empty.",
    );
    return [];
  }
}

export class OpenAITermAligner extends TermAligner {
  private base: BaseService;

  constructor(config: unknown) {
    super();
    this.base = new BaseService(config);
  }

  getId(): string {
    return "openai-term-aligner";
  }

  async align(ctx: AlignContext): Promise<TermPairCandidate[]> {
    const sourceTerms = ctx.source.candidates.map((c) => c.text);
    const targetTerms = ctx.target.candidates.map((c) => c.text);

    if (sourceTerms.length === 0 || targetTerms.length === 0) return [];

    const prompt = this.base.config.alignmentPrompt
      .replace("{{sourceText}}", ctx.source.text)
      .replace("{{targetText}}", ctx.target.text)
      .replace("{{sourceLang}}", ctx.source.sourceLang)
      .replace("{{targetLang}}", ctx.target.targetLang)
      .replace("{{sourceTerms}}", JSON.stringify(sourceTerms))
      .replace("{{targetTerms}}", JSON.stringify(targetTerms));

    const completion = await this.base.openai.chat.completions.create({
      model: this.base.model,
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
    });

    const content = completion.choices[0].message.content;
    if (!content) return [];

    try {
      const parsed = JSON.parse(content);
      const pairs = (parsed.pairs || parsed) as {
        sourceIndex: number;
        targetIndex: number;
        score: number;
      }[];

      return pairs.map((p) => ({
        source: ctx.source.candidates[p.sourceIndex],
        target: ctx.target.candidates[p.targetIndex],
        alignmentScore: p.score,
      }));
    } catch (e) {
      console.error("Failed to parse alignment result", e);
      return [];
    }
  }
}
