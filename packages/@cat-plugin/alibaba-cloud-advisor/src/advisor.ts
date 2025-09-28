import { type TranslationSuggestion } from "@cat/shared/schema/misc";
import type { TranslationAdvisor } from "@cat/plugin-core";
import { logger } from "@cat/shared/utils";
import Sender from "./sender.ts";

const languageCodeMap = new Map<string, string>([["zh_hans", "zh"]]);

export class Advisor implements TranslationAdvisor {
  private url = "";

  constructor() {
    this.url = `https://${process.env.PLUGIN_ALIBABA_CLOUD_API_ENDPOINT}/api/translate/web/${process.env.PLUGIN_ALIBABA_CLOUD_API_VERSION}`;
  }

  getId(): string {
    return "alibabaCloud";
  }

  getName() {
    return process.env.PLUGIN_ALIBABA_CLOUD_NAME ?? "Alibaba Cloud Translation";
  }

  canSuggest() {
    return true;
  }

  async getSuggestions(
    value: string,
    languageFromId: string,
    languageToId: string,
  ): Promise<TranslationSuggestion[]> {
    try {
      const body = (await Sender.send(this.url, {
        FormatType: "text",
        SourceLanguage: languageCodeMap.get(languageFromId) ?? languageFromId,
        TargetLanguage: languageCodeMap.get(languageToId) ?? languageToId,
        SourceText: value,
        Scene: "general",
      })) as {
        Code: string;
        Message: string;
        RequestId: string;
        Data: {
          Translated: string;
          WordCount: string;
          DetectedLanguage: string;
        };
      };
      if (body.Code !== "200") {
        return [
          {
            from: this.getName(),
            value: `API 调用返回了错误代码 ${body.Code}。${body.Message}`,
            status: "ERROR",
          },
        ];
      }
      return [
        {
          from: this.getName(),
          value: body.Data.Translated,
          status: "SUCCESS",
        },
      ];
    } catch (e) {
      logger.error("PLUGIN", { msg: `调用 API 时出错` }, e);
      return [
        {
          from: this.getName(),
          value: "调用 API 时出错",
          status: "ERROR",
        },
      ];
    }
  }
}
