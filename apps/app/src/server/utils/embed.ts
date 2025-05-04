import { EmbeddingsInterface } from "@langchain/core/embeddings";

export class LocalEmbeding implements EmbeddingsInterface {
  async embedDocuments(texts: string[]): Promise<number[][]> {
    const embeddingsPromises = texts.map(async (text) => await embed(text));
    return Promise.all(embeddingsPromises);
  }

  async embedQuery(query: string): Promise<number[]> {
    return await embed(query);
  }
}

export const embed = async (text: string): Promise<number[]> => {
  const response = await fetch("http://127.0.0.1:8080/embed", {
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
