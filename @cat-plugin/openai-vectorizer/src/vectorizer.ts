import type { JSONType } from "@cat/shared";
import type { VectorizedTextData } from "@cat/shared";

import {
  PluginServiceUnavailableError,
  TextVectorizer,
  type PluginServiceAvailability,
  type VectorizeContext,
} from "@cat/plugin-core";
import OpenAI from "openai";
import * as z from "zod";

const ConfigSchema = z.object({
  apiKey: z.string().optional(),
  baseURL: z.string().optional(),
  "model-id": z.string().default("text-embedding-3-small"),
});

type Config = z.infer<typeof ConfigSchema>;

const PLACEHOLDER_API_KEYS = new Set(["", "dummy-key", "your api key"]);
const PLACEHOLDER_BASE_URLS = new Set(["http://localhost:11434/v1"]);
const OFFICIAL_OPENAI_BASE_URLS = new Set(["", "https://api.openai.com/v1"]);

const normalizeConfigValue = (value: string | undefined): string => {
  return value?.trim().toLowerCase().replace(/\/+$/, "") ?? "";
};

const hasExplicitOpenAiConfig = (config: Config): boolean => {
  const apiKey = normalizeConfigValue(config.apiKey);
  const baseURL = normalizeConfigValue(config.baseURL);
  const hasRealApiKey = !PLACEHOLDER_API_KEYS.has(apiKey);
  const hasExplicitCompatibleBaseURL =
    baseURL.length > 0 &&
    !PLACEHOLDER_BASE_URLS.has(baseURL) &&
    !OFFICIAL_OPENAI_BASE_URLS.has(baseURL);

  return (
    (hasRealApiKey &&
      (OFFICIAL_OPENAI_BASE_URLS.has(baseURL) ||
        hasExplicitCompatibleBaseURL)) ||
    (!hasRealApiKey && hasExplicitCompatibleBaseURL)
  );
};

export class Vectorizer extends TextVectorizer {
  private config: Config;
  private openai: OpenAI;

  constructor(config: JSONType) {
    // oxlint-disable-next-line no-unsafe-call
    super();
    this.config = ConfigSchema.parse(config);

    this.openai = new OpenAI({
      apiKey: this.config.apiKey || "dummy-key",
      baseURL: this.config.baseURL,
    });
  }

  getId(): string {
    return "openai";
  }

  getAvailability(): PluginServiceAvailability {
    return hasExplicitOpenAiConfig(this.config)
      ? { available: true, reason: "ok" }
      : {
          available: false,
          reason: "missing-config",
          message:
            "OpenAI vectorizer requires a real apiKey or an explicit non-placeholder baseURL.",
        };
  }

  canVectorize(): boolean {
    return this.getAvailability().available;
  }

  async vectorize({
    elements,
    signal,
  }: VectorizeContext): Promise<VectorizedTextData[]> {
    const availability = this.getAvailability();
    if (!availability.available) {
      throw new PluginServiceUnavailableError(availability);
    }

    const values: string[] = elements.map((element) => element.text);

    const response = await this.openai.embeddings.create(
      {
        model: this.config["model-id"],
        input: values,
        dimensions: 1024,
      },
      { signal },
    );

    return elements.map((element, index) => [
      {
        meta: {
          modelId: this.config["model-id"],
        },
        vector: response.data[index].embedding,
      },
    ]);
  }
}
