import type { TextVectorizer } from "@cat/plugin-core";
import type { UnvectorizedTextData } from "@cat/shared/schema/misc";

export const embed = async (text: string): Promise<number[]> => {
  const url = new URL(process.env.PLUGIN_TEI_VECTORIZER_API_URL ?? "");
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ inputs: text }),
  });

  if (!response.ok) {
    throw new Error(`Server responded with ${response.status}`);
  }

  const embedding = (await response.json())[0];
  return embedding;
};

export class Vectorizer implements TextVectorizer {
  getId(): string {
    return "tei";
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
