import type { TranslationSuggestion } from "@cat/shared";
import type { TranslationAdvisor } from "@cat/plugin-core";
import { v2 } from "@google-cloud/translate";
import type { TranslatableElement } from "@cat/shared";

export class Advisor implements TranslationAdvisor {
  private client: v2.Translate | null = null;

  constructor() {
    if (process.env.PLUGIN_GOOGLE_CLOUD_ENABLE !== "false") {
      this.client = new v2.Translate({
        projectId: process.env.PLUGIN_GOOGLE_CLOUD_PROJECT_ID,
        key: process.env.PLUGIN_GOOGLE_CLOUD_API_KEY,
      });
    }
  }

  getId(): string {
    return "googleCloud";
  }

  getName() {
    return process.env.PLUGIN_GOOGLE_CLOUD_NAME ?? "Google Cloud Translate";
  }

  isEnabled() {
    return process.env.PLUGIN_GOOGLE_CLOUD_ENABLE !== "false";
  }

  canSuggest() {
    return true;
  }

  async getSuggestions(
    element: TranslatableElement,
    languageFromId: string,
    languageToId: string,
  ): Promise<TranslationSuggestion[]> {
    if (!this.client) throw new Error("Client does not initd");
    try {
      const [translated] = await this.client.translate(element.value, {
        from: languageFromId.replaceAll("_", "-"),
        to: languageToId.replaceAll("_", "-"),
      });
      return [
        {
          from: this.getName(),
          value: translated,
          status: "SUCCESS",
        },
      ];
    } catch (e) {
      console.error(e);
      return [
        {
          from: this.getName(),
          value: "Google Cloud Translation API 请求失败",
          status: "ERROR",
        },
      ];
    }
  }
}
