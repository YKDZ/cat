import { TextVectorizer } from "@cat/plugin-core";
import { UnvectorizedTextData } from "@cat/shared";

export const embed = async (text: string): Promise<number[]> => {
  const url = new URL(process.env.PLUGIN_OPENAI_VECTORIZER_API_URL ?? "");
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.PLUGIN_OPENAI_VECTORIZER_API_KEY ?? ""}`,
    },
    body: JSON.stringify({
      input: [text],
      model:
        process.env.PLUGIN_OPENAI_VECTORIZER_MODEL_ID ??
        "default/not-specified",
      modality: "text",
    }),
  });

  if (!response.ok) {
    throw new Error(`Server responded with ${response.status}`);
  }

  const data = await response.json();
  return data.data[0].embedding as number[];
};

export class Vectorizer implements TextVectorizer {
  getId(): string {
    return "openai";
  }

  canVectorize(languageId: string): boolean {
    return true;
  }

  async vectorize(
    languageId: string,
    elements: UnvectorizedTextData[],
  ): Promise<number[][]> {
    return await Promise.all(
      elements.map(async (element) => {
        return await embed(element.value);
      }),
    );
  }
}
