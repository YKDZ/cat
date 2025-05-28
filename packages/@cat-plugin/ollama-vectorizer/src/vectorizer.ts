import { TextVectorizer } from "@cat/plugin-core";
import { UnvectorizedTextData } from "@cat/shared";

export const embed = async (text: string[]): Promise<number[][]> => {
  const url = new URL(process.env.PLUGIN_OLLAMA_VECTORIZER_API_URL ?? "");
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      input: text,
      model: process.env.PLUGIN_OLLAMA_VECTORIZER_MODEL_ID ?? undefined,
    }),
  });

  if (!response.ok) {
    throw new Error(`Server responded with ${response.status}`);
  }

  const data = await response.json();
  return data.embeddings as number[][];
};

export class Vectorizer implements TextVectorizer {
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
    return await embed(elements.map((element) => element.value));
  }
}
