import { getPrismaDB } from "@cat/db";

export type SearchedMemory = {
  id: number;
  source: string;
  translation: string;
  memoryId: string;
  translatorId: string;
  similarity: number;
  translationEmbeddingId: number;
};

export const queryElementWithEmbedding = async (
  elementId: number,
): Promise<{
  id: number;
  value: string;
  embedding: number[];
  projectId: string;
}> => {
  const { client: prisma } = await getPrismaDB();
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

  if (!result[0]) throw new Error("No document found");

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
  const { client: prisma } = await getPrismaDB();
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
        translationEmbeddingId: number;
      }[]
    >`
      SELECT * FROM (
        SELECT 
          mi.id,
          mi."memoryId",
          mi.source AS source,
          mi.translation AS translation,
          mi."translationEmbeddingId",
          mi."creatorId",
          1 - (v.vector <=> ${vectorLiteral}) AS similarity
        FROM "MemoryItem" mi
        JOIN "Vector" v ON mi."sourceEmbeddingId" = v.id
        WHERE
          mi."sourceLanguageId" = ${sourceLanguageId} AND
          mi."translationLanguageId" = ${translationLanguageId} AND
          mi."memoryId" = ANY(${memoryIds})

        UNION ALL

        SELECT 
          mi.id,
          mi."memoryId",
          mi.translation AS source,
          mi.source AS translation,
          mi."translationEmbeddingId",
          mi."creatorId",
          1 - (v.vector <=> ${vectorLiteral}) AS similarity
        FROM "MemoryItem" mi
        JOIN "Vector" v ON mi."translationEmbeddingId" = v.id
        WHERE
          mi."sourceLanguageId" = ${translationLanguageId} AND
          mi."translationLanguageId" = ${sourceLanguageId} AND
          mi."memoryId" = ANY(${memoryIds})
      ) AS combined
       
      ORDER BY similarity DESC
      LIMIT ${maxAmount};
    `;

    return memories
      .filter(({ similarity }) => similarity >= minSimilarity)
      .map(
        ({
          id,
          memoryId,
          source,
          translation,
          creatorId,
          similarity,
          translationEmbeddingId,
        }) => ({
          id,
          source,
          translation,
          memoryId,
          translatorId: creatorId,
          similarity,
          translationEmbeddingId,
        }),
      );
  });
};
