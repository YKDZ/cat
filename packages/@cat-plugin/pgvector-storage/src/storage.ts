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
import type { IVectorStorage } from "@cat/plugin-core";

export class Storage implements IVectorStorage {
  getId(): string {
    return "pgvector-storage";
  }

  async store(chunks: { vector: number[]; chunkId: number }[]): Promise<void> {
    const { client: drizzle } = await getDrizzleDB();
    await drizzle.insert(vector).values(chunks);
  }

  async retrieve(
    chunkIds: number[],
  ): Promise<{ vector: number[]; chunkId: number }[]> {
    const { client: drizzle } = await getDrizzleDB();
    const result = await drizzle
      .select()
      .from(vector)
      .where(inArray(vector.chunkId, chunkIds));
    return result as { vector: number[]; chunkId: number }[];
  }

  async cosineSimilarity(
    vectors: number[][],
    chunkIdRange: number[],
    minSimilarity: number,
    maxAmount: number,
  ): Promise<{ chunkId: number; similarity: number }[]> {
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
