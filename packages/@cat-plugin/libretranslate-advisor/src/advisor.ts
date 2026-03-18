import type { JSONType } from "@cat/shared/schema/json";
import type { TranslationAdvise } from "@cat/shared/schema/plugin";

import {
  TranslationAdvisor,
  type GetSuggestionsContext,
} from "@cat/plugin-core";
import { logger } from "@cat/shared/utils";
import { Pool } from "undici";
import * as z from "zod";

const ApiConfigSchema = z.object({
  url: z.url(),
  key: z.string(),
  "alternatives-amount": z.int().min(0),
});

const BaseConfigSchema = z.object({
  "advisor-name": z.string(),
});

const ConfigSchema = z.object({
  api: ApiConfigSchema,
  base: BaseConfigSchema,
});

type Config = z.infer<typeof ConfigSchema>;

const supportedLanguages = new Map<string, string[]>();

export class Advisor extends TranslationAdvisor {
  private pool: Pool;
  private config: Config;

  constructor(config: JSONType) {
    // oxlint-disable-next-line no-unsafe-call
    super();

    this.config = ConfigSchema.parse(config);
    this.pool = new Pool(this.config.api.url);
    this.fetchSupportedLanguages().catch((err: unknown) => {
      logger
        .withSituation("PLUGIN")
        .error({ msg: "Failed to fetch supported languages" }, err);
    });
  }

  async fetchSupportedLanguages(): Promise<void> {
    await this.pool
      .request({
        method: "GET",
        path: "/languages",
      })
      .then(async (res) => {
        await res.body
          .json()
          .then((body) => {
            const successBody = z
              .array(
                z.object({
                  code: z.string(),
                  name: z.string(),
                  targets: z.array(z.string()),
                }),
              )
              .parse(body);
            successBody.forEach((item) => {
              supportedLanguages.set(item.code, item.targets);
            });
          })
          .catch((e: unknown) => {
            logger.withSituation("PLUGIN").error(
              {
                msg: "Can not parse all supported languages response body.",
              },
              e,
            );
          });
      })
      .catch((e: unknown) => {
        logger.withSituation("PLUGIN").error(
          {
            msg: `Can not query all supported language from LibreTranslate service`,
          },
          e,
        );
      });
  }

  getId(): string {
    return "libretranslate";
  }

  getDisplayName(): string {
    return this.config.base["advisor-name"];
  }

  async advise({
    source: { text, languageId },
    targetLanguageId,
  }: GetSuggestionsContext): Promise<TranslationAdvise[]> {
    const sourceLang = languageId.replaceAll("_", "-");
    const targetLang = targetLanguageId.replaceAll("_", "-");

    try {
      return await this.translate(text, sourceLang, targetLang);
    } catch (e) {
      logger
        .withSituation("PLUGIN")
        .error({ msg: `LibreTranslate API 请求或解析错误` }, e);
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
