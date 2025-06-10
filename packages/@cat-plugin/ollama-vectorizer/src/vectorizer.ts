import type { PluginLoadOptions, TextVectorizer } from "@cat/plugin-core";
import type { UnvectorizedTextData } from "@cat/shared";

export class Vectorizer implements TextVectorizer {
  private options: PluginLoadOptions;

  private config = (key: string): unknown => {
    const config = this.options.configs.find((config) => config.key === key);
    return config?.value;
  };

  constructor(options: PluginLoadOptions) {
    this.options = options;
  }

  getId(): string {
    return "ollama";
  }

  canVectorize(languageId: string): boolean {
    return true;
  }

  async vectorize(
    languageId: string,
    elements: UnvectorizedTextData[],
  ): Promise<number[][]> {
    const values: string[] = elements.map((element) => element.value);

    const response = await fetch(new URL(this.config("api.url") as string), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        input: values,
        model: this.config("api.model-id") as string,
      }),
    });

    if (!response.ok) {
      throw new Error(`Server responded with ${response.status}`);
    }

    const data = await response.json();
    return data.embeddings as number[][];
  }
}
