import type {
  NlpBatchSegmentContext,
  NlpBatchSegmentResult,
  NlpSegmentContext,
  NlpSegmentResult,
  NlpToken,
} from "@cat/plugin-core";
import type { JSONType } from "@cat/shared";

import { NlpWordSegmenter } from "@cat/plugin-core";
import { logger } from "@cat/shared";
import { Pool } from "undici";
import * as z from "zod";

import type { SpacySegmentResponse, SpacyTokenResponse } from "./types";

import {
  SpacyBatchSegmentResponseSchema,
  SpacyLanguagesResponseSchema,
  SpacySegmentResponseSchema,
} from "./types";

const SpacyConfigSchema = z.object({
  serverUrl: z.url(),
  timeout: z.int().positive().optional().default(30000),
  languageModelMap: z.record(z.string(), z.string()).optional(),
});

type SpacyConfig = z.infer<typeof SpacyConfigSchema>;

export class SpacyWordSegmenter extends NlpWordSegmenter {
  private readonly pool: Pool;
  private readonly config: SpacyConfig;

  constructor(config: JSONType) {
    // oxlint-disable-next-line no-unsafe-call
    super();

    this.config = SpacyConfigSchema.parse(config);
    this.pool = new Pool(this.config.serverUrl);
  }

  getId = (): string => "spacy-word-segmenter";

  getSupportedLanguages = async (): Promise<string[]> => {
    try {
      const response = await this.pool.request({
        method: "GET",
        path: "/languages",
        headersTimeout: this.config.timeout,
        bodyTimeout: this.config.timeout,
      });

      const data = SpacyLanguagesResponseSchema.parse(
        await response.body.json(),
      );
      return data.languages;
    } catch (err) {
      logger
        .withSituation("PLUGIN")
        .error(err, "Failed to fetch supported languages from spaCy server");
      return [];
    }
  };

  segment = async (ctx: NlpSegmentContext): Promise<NlpSegmentResult> => {
    const lang = this.mapLanguage(ctx.languageId);

    const response = await this.pool.request({
      method: "POST",
      path: "/segment",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: ctx.text, lang }),
      signal: ctx.signal,
      headersTimeout: this.config.timeout,
      bodyTimeout: this.config.timeout,
    });

    const spacyResult = SpacySegmentResponseSchema.parse(
      await response.body.json(),
    );
    return this.transformResponse(spacyResult);
  };

  override batchSegment = async (
    ctx: NlpBatchSegmentContext,
  ): Promise<NlpBatchSegmentResult> => {
    const lang = this.mapLanguage(ctx.languageId);

    const response = await this.pool.request({
      method: "POST",
      path: "/batch-segment",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: ctx.items, lang }),
      signal: ctx.signal,
      headersTimeout: this.config.timeout,
      bodyTimeout: this.config.timeout,
    });

    const data = SpacyBatchSegmentResponseSchema.parse(
      await response.body.json(),
    );
    return {
      results: data.results.map(({ id, result }) => ({
        id,
        result: this.transformResponse(result),
      })),
    };
  };

  private transformResponse = (
    raw: SpacySegmentResponse,
  ): NlpSegmentResult => ({
    sentences: raw.sentences.map((sent) => ({
      text: sent.text,
      start: sent.start,
      end: sent.end,
      tokens: sent.tokens.map(this.transformToken),
    })),
    tokens: raw.tokens.map(this.transformToken),
  });

  private transformToken = (t: SpacyTokenResponse): NlpToken => ({
    text: t.text,
    lemma: t.lemma,
    pos: t.pos,
    start: t.start,
    end: t.end,
    isStop: t.is_stop,
    isPunct: t.is_punct,
  });

  private mapLanguage = (languageId: string): string =>
    this.config.languageModelMap?.[languageId] ?? languageId.split("-")[0];
}
