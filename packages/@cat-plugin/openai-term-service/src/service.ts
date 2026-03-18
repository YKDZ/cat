import {
  TermExtractor,
  TermAligner,
  ExtractContext,
  AlignContext,
  TermCandidate,
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

    const completion = await this.base.openai.chat.completions.create(
      {
        model: this.base.model,
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
      },
      { signal: ctx.signal },
    );

    const content = completion.choices[0].message.content;
    if (!content) return [];

    try {
      const rawParsed: unknown = JSON.parse(content);
      if (
        typeof rawParsed !== "object" ||
        rawParsed === null ||
        Array.isArray(rawParsed)
      )
        return [];
      // oxlint-disable-next-line no-unsafe-type-assertion -- narrowed to non-null, non-array object before assertion
      const parsed = rawParsed as Record<string, unknown>;
      const raw: unknown = parsed.terms ?? parsed.candidates ?? rawParsed;
      if (!Array.isArray(raw)) return [];

      const result: TermCandidate[] = [];
      for (const item of raw) {
        if (typeof item !== "object" || item === null) continue;
        // oxlint-disable-next-line no-unsafe-type-assertion -- narrowed to object before assertion
        const rec = item as Record<string, unknown>;
        if (typeof rec.text !== "string" || !rec.text) continue;
        const text = rec.text;
        const normalized =
          typeof rec.normalizedText === "string" ? rec.normalizedText : text;

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
      // oxlint-disable-next-line no-console
      console.error("Failed to parse extraction result", e);
      return [];
    }
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
      const rawParsed: unknown = JSON.parse(content);
      // oxlint-disable-next-line no-unsafe-type-assertion -- accessing .pairs on runtime-validated JSON
      const pairsData: unknown =
        typeof rawParsed === "object" &&
        rawParsed !== null &&
        "pairs" in rawParsed
          ? (rawParsed as Record<string, unknown>).pairs
          : rawParsed;
      // oxlint-disable-next-line no-unsafe-type-assertion -- JSON structure validated at runtime
      const pairs = (Array.isArray(pairsData) ? pairsData : []) as {
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
      // oxlint-disable-next-line no-console
      console.error("Failed to parse alignment result", e);
      return [];
    }
  }
}
