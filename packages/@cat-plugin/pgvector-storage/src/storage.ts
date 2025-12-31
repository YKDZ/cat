import {
  and,
  cosineDistance,
  desc,
  getDrizzleDB,
  gt,
  inArray,
  sql,
  vector,
} from "@cat/db";
import {
  VectorStorage,
  type CosineSimilarityContext,
  type RetrieveContext,
  type StoreContext,
} from "@cat/plugin-core";

export class Storage extends VectorStorage {
  getId(): string {
    return "pgvector-storage";
  }

  async store({ chunks }: StoreContext): Promise<void> {
    const { client: drizzle } = await getDrizzleDB();
    await drizzle.insert(vector).values(chunks);
  }

  async retrieve({
    chunkIds,
  }: RetrieveContext): Promise<{ vector: number[]; chunkId: number }[]> {
    const { client: drizzle } = await getDrizzleDB();
    const result = await drizzle
      .select()
      .from(vector)
      .where(inArray(vector.chunkId, chunkIds));
    return result as { vector: number[]; chunkId: number }[];
  }

  async cosineSimilarity({
    vectors,
    chunkIdRange,
    minSimilarity,
    maxAmount,
  }: CosineSimilarityContext): Promise<
    { chunkId: number; similarity: number }[]
  > {
    const { client: drizzle } = await getDrizzleDB();

    const similarities = vectors.map(
      (embedding) =>
        sql<number>`1 - (${cosineDistance(vector.vector, embedding)})`,
    );

    const maxSimilarity = sql<number>`GREATEST(${sql.join(similarities, sql`, `)})`;

    const result = await drizzle
      .select({
        chunkId: vector.chunkId,
        similarity: maxSimilarity,
      })
      .from(vector)
      .where(
        and(
          inArray(vector.chunkId, chunkIdRange),
          gt(maxSimilarity, minSimilarity),
        ),
      )
      .orderBy(desc(maxSimilarity))
      .limit(maxAmount);

    return result;
  }
}
