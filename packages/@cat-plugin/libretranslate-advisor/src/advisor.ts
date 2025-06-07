import type { PluginLoadOptions, TranslationAdvisor } from "@cat/plugin-core";
import type {
  TranslatableElement,
  TranslationSuggestion} from "@cat/shared";
import {
  safeJoin
} from "@cat/shared";

const supportedLangages = new Map<string, string[]>();
let isEnabled = true;

export class LibreTranslateTranslationAdvisor implements TranslationAdvisor {
  private options: PluginLoadOptions;
  private tranlateURL: string;
  private languagesURL: string;

  private config = (key: string): unknown => {
    const config = this.options.configs.find((config) => config.key === key);
    return config?.value ?? config?.default;
  };

  constructor(options: PluginLoadOptions) {
    this.options = options;
    this.tranlateURL = safeJoin(this.config("api.url") as string, "translate");
    this.languagesURL = safeJoin(this.config("api.url") as string, "languages");
    fetchSupportedLanguages(this.languagesURL);
  }

  getId(): string {
    return "libretranslate";
  }

  getName() {
    return this.config("base.advisor-name") as string;
  }

  isEnabled() {
    return isEnabled;
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
    languageFromId: string,
    languageToId: string,
  ): Promise<TranslationSuggestion[]> {
    const sourceLang = languageFromId.replaceAll("_", "-");
    const targetLang = languageToId.replaceAll("_", "-");

    if (element.value.trim().length === 0) {
      return [
        {
          from: this.getName(),
          value: "可翻译元素是空白的，LibreTranslate API 不会翻译它。",
          status: "ERROR",
        },
      ];
    }

    try {
      const res = await fetch(this.tranlateURL, {
        method: "POST",
        body: JSON.stringify({
          q: element.value,
          source: sourceLang,
          target: targetLang,
          format: "text",
          alternatives: this.config("api.alternatives-amount") as number,
          api_key: this.config("api.key") as string,
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
            ];
          case 403:
            return [
              {
                from: this.getName(),
                value: `访问被禁止：${msg}`,
                status: "ERROR",
              },
            ];
          case 500:
            return [
              {
                from: this.getName(),
                value: `LibreTrasnslate API 服务器内部错误：${msg}`,
                status: "ERROR",
              },
            ];
          case 400:
            return [
              {
                from: this.getName(),
                value: `请求错误：${msg}`,
                status: "ERROR",
              },
            ];
          default:
            return [
              {
                from: this.getName(),
                value: `翻译失败（状态码 ${res.status}）：${msg}`,
                status: "ERROR",
              },
            ];
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
    } catch (e) {
      console.error(e);
      return [
        {
          from: this.getName(),
          value: "LibreTranslate API 请求或解析错误。",
          status: "ERROR",
        },
      ];
    }
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
          console.error(
            "Can not parse all supported languages response body. LibreTranslate suggestion will be disabled.",
          );
          console.error(e);
        });
    })
    .catch((e) => {
      isEnabled = false;
      console.error(
        "Can not query all supported language from LibreTranslate service through " +
          languagesURL +
          ". LibreTranslate suggestion will be disabled.",
      );
      console.error(e);
    });
};
