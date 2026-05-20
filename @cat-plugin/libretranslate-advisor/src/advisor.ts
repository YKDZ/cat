import type { JSONType } from "@cat/shared";
import type { TranslationAdvise } from "@cat/shared";

import {
  type PluginServiceAvailability,
  TranslationAdvisor,
  type GetSuggestionsContext,
} from "@cat/plugin-core";
import { logger } from "@cat/shared";
import { Pool } from "undici";
import * as z from "zod";

const ApiConfigSchema = z
  .object({
    url: z.url().default("http://localhost:5000/"),
    key: z.string().default(""),
    "alternatives-amount": z.int().min(0).default(2),
  })
  .default({
    url: "http://localhost:5000/",
    key: "",
    "alternatives-amount": 2,
  });

const BaseConfigSchema = z
  .object({
    "advisor-name": z.string().default("LibreTranslate"),
  })
  .default({
    "advisor-name": "LibreTranslate",
  });

const ConfigSchema = z.object({
  api: ApiConfigSchema,
  base: BaseConfigSchema,
});

type Config = z.infer<typeof ConfigSchema>;

export class Advisor extends TranslationAdvisor {
  private pool: Pool;
  private config: Config;

  constructor(config: JSONType) {
    // oxlint-disable-next-line no-unsafe-call
    super();

    this.config = ConfigSchema.parse(config);
    this.pool = new Pool(this.config.api.url);
  }

  getId(): string {
    return "libretranslate";
  }

  getDisplayName(): string {
    return this.config.base["advisor-name"];
  }

  getAvailability(): PluginServiceAvailability {
    return { available: true, reason: "ok" };
  }

  async advise({
    source: { text, languageId },
    targetLanguageId,
  }: GetSuggestionsContext): Promise<TranslationAdvise[]> {
    const availability = this.getAvailability();
    if (!availability.available) {
      return [
        {
          translation: availability.message ?? availability.reason,
          confidence: 0,
        },
      ] satisfies TranslationAdvise[];
    }

    const sourceLang = languageId.replaceAll("_", "-");
    const targetLang = targetLanguageId.replaceAll("_", "-");

    try {
      return await this.translate(text, sourceLang, targetLang);
    } catch (e) {
      logger
        .withSituation("PLUGIN")
        .error(e, `LibreTranslate API 请求或解析错误`);
      return [
        {
          translation: "LibreTranslate API 请求或解析错误。",
          confidence: 0,
        },
      ] satisfies TranslationAdvise[];
    }
  }

  private async translate(
    value: string,
    sourceLang: string,
    targetLang: string,
  ) {
    if (value.trim().length === 0) {
      return [
        {
          translation: "可翻译元素是空白的，LibreTranslate API 不会翻译它。",
          confidence: 0,
        },
      ] satisfies TranslationAdvise[];
    }

    const res = await this.pool.request({
      method: "POST",
      path: "/translate",
      body: JSON.stringify({
        q: value,
        source: sourceLang,
        target: targetLang,
        format: "text",
        alternatives: this.config.api["alternatives-amount"],
        api_key: this.config.api.key,
      }),
      headers: { "Content-Type": "application/json" },
    });

    const body = await res.body.json();

    if (res.statusCode !== 200) {
      const msg =
        z.object({ error: z.string().optional() }).parse(body).error ||
        "未知错误";
      switch (res.statusCode) {
        case 429:
          return [
            {
              translation: `速率限制：${msg}`,
              confidence: 0,
            },
          ] satisfies TranslationAdvise[];
        case 403:
          return [
            {
              translation: `访问被禁止：${msg}`,
              confidence: 0,
            },
          ] satisfies TranslationAdvise[];
        case 500:
          return [
            {
              translation: `LibreTranslate API 服务器内部错误：${msg}`,
              confidence: 0,
            },
          ] satisfies TranslationAdvise[];
        case 400:
          return [
            {
              translation: `请求错误：${msg}`,
              confidence: 0,
            },
          ] satisfies TranslationAdvise[];
        default:
          return [
            {
              translation: `翻译失败（状态码 ${res.statusCode}）：${msg}`,
              confidence: 0,
            },
          ] satisfies TranslationAdvise[];
      }
    }

    const successBody = z
      .object({
        alternatives: z.array(z.string()).optional(),
        translatedText: z.string(),
      })
      .parse(body);

    const result: TranslationAdvise[] = [
      {
        translation: successBody.translatedText,
        confidence: 0,
      },
    ];
    if (successBody.alternatives && successBody.alternatives.length > 0) {
      successBody.alternatives
        .map(
          (translation) =>
            ({
              translation,
              confidence: 1,
            }) satisfies TranslationAdvise,
        )
        .forEach((translation) => result.push(translation));
    }
    return result;
  }
}
