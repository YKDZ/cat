import {
  and,
  cosineDistance,
  desc,
  eq,
  gt,
  inArray,
  memoryItem,
  OverallDrizzleClient,
  sql,
  vector,
} from "@cat/db";
import { MemorySuggestion } from "@cat/shared/schema/misc";

export const searchMemory = async (
  drizzle: OverallDrizzleClient,
  embedding: number[],
  sourceLanguageId: string,
  translationLanguageId: string,
  memoryIds: string[],
  minSimilarity: number = 0.8,
  maxAmount: number = 3,
): Promise<MemorySuggestion[]> => {
  const similarity = sql<number>`1 - (${cosineDistance(vector.vector, embedding)})`;

  // source -> translation
  const sourceResults = await drizzle
    .select({
      id: memoryItem.id,
      translationEmbeddingId: memoryItem.sourceEmbeddingId,
      memoryId: memoryItem.memoryId,
      source: memoryItem.source,
      translation: memoryItem.translation,
      creatorId: memoryItem.creatorId,
      similarity,
      createdAt: memoryItem.createdAt,
      updatedAt: memoryItem.updatedAt,
    })
    .from(memoryItem)
    .innerJoin(vector, eq(memoryItem.sourceEmbeddingId, vector.id))
    .where(
      and(
        eq(memoryItem.sourceLanguageId, sourceLanguageId),
        eq(memoryItem.translationLanguageId, translationLanguageId),
        inArray(memoryItem.memoryId, memoryIds),
        gt(similarity, minSimilarity),
      ),
    )
    .orderBy(desc(similarity))
    .limit(maxAmount);

  // translation -> source
  const transResults = await drizzle
    .select({
      id: memoryItem.id,
      translationEmbeddingId: memoryItem.sourceEmbeddingId,
      memoryId: memoryItem.memoryId,
      source: memoryItem.translation,
      translation: memoryItem.source,
      creatorId: memoryItem.creatorId,
      similarity,
      createdAt: memoryItem.createdAt,
      updatedAt: memoryItem.updatedAt,
    })
    .from(memoryItem)
    .innerJoin(vector, eq(memoryItem.translationEmbeddingId, vector.id))
    .where(
      and(
        eq(memoryItem.sourceLanguageId, translationLanguageId),
        eq(memoryItem.translationLanguageId, sourceLanguageId),
        inArray(memoryItem.memoryId, memoryIds),
        gt(similarity, minSimilarity),
      ),
    )
    .orderBy(desc(similarity))
    .limit(maxAmount);

  const allResults = uniqueBy(
    [...sourceResults, ...transResults],
    (item) => item.source + item.translation,
  )
    .filter((item) => item.similarity >= minSimilarity)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, maxAmount);

  return allResults;
};

const uniqueBy = <T, K>(arr: T[], keyFn: (item: T) => K): T[] => {
  const seen = new Set<K>();
  return arr.filter((item) => {
    const key = keyFn(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};
