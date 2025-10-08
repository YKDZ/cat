import type { TranslationAdvisor } from "@cat/plugin-core";
import type { JSONType } from "@cat/shared/schema/json";
import type { TranslationSuggestion } from "@cat/shared/schema/misc";
import type { TermRelation } from "@cat/shared/schema/drizzle/glossary";
import { logger } from "@cat/shared/utils";
import { Pool } from "undici";
import * as z from "zod/v4";

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

export class LibreTranslateTranslationAdvisor implements TranslationAdvisor {
  private pool: Pool;
  private config: Config;

  constructor(config: JSONType) {
    this.config = ConfigSchema.parse(config);
    this.pool = new Pool(this.config.api.url);
    this.fetchSupportedLanguages();
  }

  async fetchSupportedLanguages() {
    await this.pool
      .request({
        method: "GET",
        path: "/languages",
      })
      .then(async (res) => {
        await res.body
          .json()
          .then((body) => {
            const successBody = body as {
              code: string;
              name: string;
              targets: string[];
            }[];
            successBody.forEach((item) => {
              supportedLanguages.set(item.code, item.targets);
            });
          })
          .catch((e) => {
            logger.error(
              "PLUGIN",
              {
                msg: "Can not parse all supported languages response body.",
              },
              e,
            );
          });
      })
      .catch((e) => {
        logger.error(
          "PLUGIN",
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

  getName() {
    return this.config.base["advisor-name"];
  }

  canSuggest(languageFromId: string, languageToId: string) {
    const sourceLang = languageFromId.replaceAll("_", "-");
    const targetLang = languageToId.replaceAll("_", "-");
    return (
      supportedLanguages.size === 0 ||
      (supportedLanguages.get(sourceLang) ?? []).includes(targetLang)
    );
  }

  async getSuggestions(
    value: string,
    termedValue: string,
    termRelations: Required<TermRelation>[],
    languageFromId: string,
    languageToId: string,
  ): Promise<TranslationSuggestion[]> {
    const sourceLang = languageFromId.replaceAll("_", "-");
    const targetLang = languageToId.replaceAll("_", "-");

    try {
      const raw = await this.translate(value, sourceLang, targetLang);
      const termed = [];
      if (termedValue !== value) {
        termed.push(
          ...(await this.translate(termedValue, sourceLang, targetLang)),
        );
      }
      return [...termed, ...raw];
    } catch (e) {
      logger.error("PLUGIN", { msg: `LibreTranslate API 请求或解析错误` }, e);
      return [
        {
          from: this.getName(),
          value: "LibreTranslate API 请求或解析错误。",
          status: "ERROR",
        },
      ] satisfies TranslationSuggestion[];
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
          from: this.getName(),
          value: "可翻译元素是空白的，LibreTranslate API 不会翻译它。",
          status: "ERROR",
        },
      ] satisfies TranslationSuggestion[];
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
      const msg = (body as { error?: string }).error || "未知错误";
      switch (res.statusCode) {
        case 429:
          return [
            {
              from: this.getName(),
              value: `速率限制：${msg}`,
              status: "ERROR",
            },
          ] satisfies TranslationSuggestion[];
        case 403:
          return [
            {
              from: this.getName(),
              value: `访问被禁止：${msg}`,
              status: "ERROR",
            },
          ] satisfies TranslationSuggestion[];
        case 500:
          return [
            {
              from: this.getName(),
              value: `LibreTranslate API 服务器内部错误：${msg}`,
              status: "ERROR",
            },
          ] satisfies TranslationSuggestion[];
        case 400:
          return [
            {
              from: this.getName(),
              value: `请求错误：${msg}`,
              status: "ERROR",
            },
          ] satisfies TranslationSuggestion[];
        default:
          return [
            {
              from: this.getName(),
              value: `翻译失败（状态码 ${res.statusCode}）：${msg}`,
              status: "ERROR",
            },
          ] satisfies TranslationSuggestion[];
      }
    }

    const successBody = body as {
      alternatives?: string[];
      translatedText: string;
    };

    const result: TranslationSuggestion[] = [
      {
        from: this.getName(),
        value: successBody.translatedText,
        status: "SUCCESS",
      },
    ];
    if (successBody.alternatives && successBody.alternatives.length > 0) {
      successBody.alternatives
        .map(
          (translation) =>
            ({
              from: this.getName(),
              value: translation,
              status: "SUCCESS",
            }) satisfies TranslationSuggestion,
        )
        .forEach((translation) => result.push(translation));
    }
    return result;
  }
}
