import type { TranslationAdvisor } from "@cat/plugin-core";
import type {
  JSONType,
  TermRelation,
  TranslatableElement,
  TranslationSuggestion,
} from "@cat/shared";
import { logger, safeJoinURL } from "@cat/shared";

const supportedLangages = new Map<string, string[]>();

export class LibreTranslateTranslationAdvisor implements TranslationAdvisor {
  private configs: Record<string, JSONType>;
  private tranlateURL: string;
  private languagesURL: string;

  private config = <T>(key: string, fallback: T): T => {
    const config = this.configs[key];
    if (!config) return fallback;
    return config as T;
  };

  constructor(configs: Record<string, JSONType>) {
    this.configs = configs;
    this.tranlateURL = safeJoinURL(
      this.config("api", { url: "http://localhost:3000" }).url,
      "translate",
    );
    this.languagesURL = safeJoinURL(
      this.config("api", { url: "http://localhost:3000" }).url,
      "languages",
    );
    fetchSupportedLanguages(this.languagesURL);
  }

  getId(): string {
    return "libretranslate";
  }

  getName() {
    return this.config("base.advisor-name", "LibreTranslate");
  }

  canSuggest(
    element: TranslatableElement,
    languageFromId: string,
    languageToId: string,
  ) {
    const sourceLang = languageFromId.replaceAll("_", "-");
    const targetLang = languageToId.replaceAll("_", "-");
    return (
      supportedLangages.size === 0 ||
      (supportedLangages.get(sourceLang) ?? []).includes(targetLang)
    );
  }

  async getSuggestions(
    element: TranslatableElement,
    termedValue: string,
    termRelations: Required<TermRelation>[],
    languageFromId: string,
    languageToId: string,
  ): Promise<TranslationSuggestion[]> {
    const sourceLang = languageFromId.replaceAll("_", "-");
    const targetLang = languageToId.replaceAll("_", "-");

    try {
      const raw = await this.translate(element.value, sourceLang, targetLang);
      const termed = [];
      if (termedValue !== element.value) {
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

    const config = this.config("api", {
      key: "no key",
      "alternatives-amount": 1,
    });

    const res = await fetch(this.tranlateURL, {
      method: "POST",
      body: JSON.stringify({
        q: value,
        source: sourceLang,
        target: targetLang,
        format: "text",
        alternatives: config["alternatives-amount"],
        api_key: config.key,
      }),
      headers: { "Content-Type": "application/json" },
    });

    const body = await res.json();

    if (res.status !== 200) {
      const msg = (body as { error?: string }).error || "未知错误";
      switch (res.status) {
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
              value: `LibreTrasnslate API 服务器内部错误：${msg}`,
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
              value: `翻译失败（状态码 ${res.status}）：${msg}`,
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

const fetchSupportedLanguages = async (languagesURL: string) => {
  await fetch(languagesURL, {
    method: "GET",
  })
    .then(async (res) => {
      await res
        .json()
        .then((body) => {
          const successBody = body as {
            code: string;
            name: string;
            targets: string[];
          }[];
          successBody.forEach((item) => {
            supportedLangages.set(item.code, item.targets);
          });
        })
        .catch((e) => {
          logger.error(
            "PLUGIN",
            {
              msg: "Can not parse all supported languages response body. LibreTranslate suggestion will be disabled.",
            },
            e,
          );
        });
    })
    .catch((e) => {
      logger.error(
        "PLUGIN",
        {
          msg: `Can not query all supported language from LibreTranslate service through ${languagesURL}`,
        },
        e,
      );
    });
};
