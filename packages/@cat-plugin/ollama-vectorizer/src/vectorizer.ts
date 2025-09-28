import type { TextVectorizer } from "@cat/plugin-core";
import type { JSONType } from "@cat/shared/schema/json";
import type { UnvectorizedTextData } from "@cat/shared/schema/misc";
import { Pool } from "undici";
import * as z from "zod/v4";

const ConfigSchema = z.object({
  url: z.url(),
  "model-id": z.string(),
});

type Config = z.infer<typeof ConfigSchema>;

export class Vectorizer implements TextVectorizer {
  private config: Config;
  private pool: Pool;

  constructor(config: JSONType) {
    this.config = ConfigSchema.parse(config);
    this.pool = new Pool(new URL(this.config.url));
  }

  getId(): string {
    return "ollama";
  }

  canVectorize(languageId: string): boolean {
    return true;
  }

  async vectorize(elements: UnvectorizedTextData[]): Promise<number[][]> {
    const values: string[] = elements.map((element) => element.value);

    const response = await this.pool.request({
      path: "/api/embed",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        input: values,
        model: this.config["model-id"],
      }),
    });

    if (response.statusCode !== 200) {
      throw new Error(`Server responded with ${response.statusCode}`);
    }

    const data = (await response.body.json()) as { embeddings: number[][] };
    return data.embeddings;
  }
}
