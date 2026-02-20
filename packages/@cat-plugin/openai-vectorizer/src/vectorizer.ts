import { TextVectorizer, type VectorizeContext } from "@cat/plugin-core";
import type { JSONType } from "@cat/shared/schema/json";
import type { VectorizedTextData } from "@cat/shared/schema/misc";
import OpenAI from "openai";
import * as z from "zod/v4";

const ConfigSchema = z.object({
  apiKey: z.string().optional(),
  baseURL: z.string().optional(),
  "model-id": z.string().default("text-embedding-3-small"),
});

type Config = z.infer<typeof ConfigSchema>;

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

  canVectorize(): boolean {
    return true;
  }

  async vectorize({
    elements,
  }: VectorizeContext): Promise<VectorizedTextData[]> {
    const values: string[] = elements.map((element) => element.text);

    const response = await this.openai.embeddings.create({
      model: this.config["model-id"],
      input: values,
      dimensions: 1024,
    });

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
