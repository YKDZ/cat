import {
  and,
  cosineDistance,
  desc,
  document,
  eq,
  gt,
  inArray,
  memoryItem,
  OverallDrizzleClient,
  sql,
  translatableElement,
  vector,
} from "@cat/db";
import { getSingle } from "@cat/shared/utils";

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
  drizzle: OverallDrizzleClient,
  elementId: number,
): Promise<{
  id: number;
  value: string;
  embedding: number[];
}> => {
  const element = getSingle(
    await drizzle
      .select({
        id: translatableElement.id,
        value: translatableElement.value,
        embedding: vector.vector,
      })
      .from(translatableElement)
      .innerJoin(vector, eq(translatableElement.embeddingId, vector.id))
      .innerJoin(document, eq(translatableElement.documentId, document.id))
      .where(eq(translatableElement.id, elementId))
      .limit(1),
  );

  return {
    id: element.id,
    value: element.value,
    embedding: element.embedding,
  };
};

export const searchMemory = async (
  drizzle: OverallDrizzleClient,
  embedding: number[],
  sourceLanguageId: string,
  translationLanguageId: string,
  memoryIds: string[],
  minSimilarity: number = 0.8,
  maxAmount: number = 3,
): Promise<SearchedMemory[]> => {
  // source -> translation
  const similaritySource = sql<number>`1 - (${cosineDistance(memoryItem.sourceEmbeddingId, embedding)})`;
  const sourceResults = await drizzle
    .select({
      id: memoryItem.id,
      memoryId: memoryItem.memoryId,
      source: memoryItem.source,
      translation: memoryItem.translation,
      translationEmbeddingId: memoryItem.translationEmbeddingId,
      creatorId: memoryItem.creatorId,
      similarity: similaritySource,
    })
    .from(memoryItem)
    .where(
      and(
        eq(memoryItem.sourceLanguageId, sourceLanguageId),
        eq(memoryItem.translationLanguageId, translationLanguageId),
        inArray(memoryItem.memoryId, memoryIds),
        gt(similaritySource, minSimilarity),
      ),
    )
    .orderBy(desc(similaritySource))
    .limit(maxAmount);

  // translation -> source
  const similarityTrans = sql<number>`1 - (${cosineDistance(memoryItem.translationEmbeddingId, embedding)})`;
  const transResults = await drizzle
    .select({
      id: memoryItem.id,
      memoryId: memoryItem.memoryId,
      source: memoryItem.translation,
      translation: memoryItem.source,
      translationEmbeddingId: memoryItem.translationEmbeddingId,
      creatorId: memoryItem.creatorId,
      similarity: similarityTrans,
    })
    .from(memoryItem)
    .where(
      and(
        eq(memoryItem.sourceLanguageId, translationLanguageId),
        eq(memoryItem.translationLanguageId, sourceLanguageId),
        inArray(memoryItem.memoryId, memoryIds),
        gt(similarityTrans, minSimilarity),
      ),
    )
    .orderBy(desc(similarityTrans))
    .limit(maxAmount);

  const allResults = [...sourceResults, ...transResults]
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, maxAmount)
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
  return allResults;
};
