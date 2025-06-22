import { prisma } from "@cat/db";

export type SearchedMemory = {
  id: number;
  source: string;
  translation: string;
  memoryId: string;
  translatorId: string;
  similarity: number;
};

export const queryElementWithEmbedding = async (
  elementId: number,
): Promise<{
  id: number;
  value: string;
  embedding: number[];
  projectId: string;
}> => {
  const result = await prisma.$queryRaw<
    {
      id: number;
      value: string;
      embedding: number[];
      projectId: string;
    }[]
  >`
  SELECT
    te.id AS id,
    te.value AS value,
    v.vector::real[] AS embedding,
    p.id AS "projectId"
  FROM
    "TranslatableElement" te
  JOIN
    "Vector" v ON te."embeddingId" = v.id
  JOIN
    "Document" d ON te."documentId" = d.id
  JOIN
    "Project" p ON d."projectId" = p.id
  WHERE
    te.id = ${elementId};
`;

  return result[0];
};

export const searchMemory = async (
  embedding: number[],
  sourceLanguageId: string,
  translationLanguageId: string,
  memoryIds: string[],
  minSimilarity: number = 0.8,
  maxAmount: number = 3,
): Promise<SearchedMemory[]> => {
  const vectorLiteral = `[${embedding.join(",")}]`;

  return await prisma.$transaction(async (tx) => {
    const memories = await tx.$queryRaw<
      {
        id: number;
        memoryId: string;
        source: string;
        translation: string;
        creatorId: string;
        similarity: number;
      }[]
    >`
      SELECT 
        mi.id,
        mi."memoryId",
        mi.source,
        mi.translation,
        mi."creatorId",
        1 - (v.vector <=> ${vectorLiteral}) AS similarity
      FROM 
        "MemoryItem" mi
      JOIN
        "Vector" v ON mi."sourceEmbeddingId" = v.id
      WHERE
        mi."sourceLanguageId" = ${sourceLanguageId} AND
        mi."translationLanguageId" = ${translationLanguageId} AND
        mi."memoryId" = ANY(${memoryIds})
      ORDER BY similarity DESC
      LIMIT ${maxAmount};
    `;

    return memories
      .filter(({ similarity }) => similarity >= minSimilarity)
      .map(({ id, memoryId, source, translation, creatorId, similarity }) => ({
        id,
        source,
        translation,
        memoryId,
        translatorId: creatorId,
        similarity,
      }));
  });
};
