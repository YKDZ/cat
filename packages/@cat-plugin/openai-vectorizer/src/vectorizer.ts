import { TextVectorizer } from "@cat/plugin-core";
import type { JSONType } from "@cat/shared/schema/json";
import type {
  UnvectorizedTextData,
  VectorizedTextData,
} from "@cat/shared/schema/misc";
import { Pool } from "undici";
import * as z from "zod/v4";

const ConfigSchema = z.object({
  url: z.url(),
  path: z.string(),
  "model-id": z.string(),
});

type Config = z.infer<typeof ConfigSchema>;

export class Vectorizer extends TextVectorizer {
  private config: Config;
  private pool: Pool;

  constructor(config: JSONType) {
    // oxlint-disable-next-line no-unsafe-call
    super();
    this.config = ConfigSchema.parse(config);
    this.pool = new Pool(new URL(this.config.url));
  }

  getId(): string {
    return "openai";
  }

  canVectorize(): boolean {
    return true;
  }

  async vectorize(
    elements: UnvectorizedTextData[],
  ): Promise<VectorizedTextData[]> {
    const values: string[] = elements.map((element) => element.text);

    const response = await this.pool.request({
      path: this.config.path,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        input: values,
        model: this.config["model-id"],
        dimensions: 1024,
      }),
    });

    if (response.statusCode !== 200) {
      throw new Error(
        `Server responded with ${response.statusCode}. Response: ${JSON.stringify(response)}`,
      );
    }

    const data = z
      .object({
        embeddings: z.array(z.array(z.number())),
      })
      .parse(await response.body.json());

    return elements.map((_, index) => [
      {
        meta: {
          modelId: this.config["model-id"],
        },
        vector: data.embeddings[index],
      },
    ]);
  }
}
