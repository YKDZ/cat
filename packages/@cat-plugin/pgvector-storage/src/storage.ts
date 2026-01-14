import { getDrizzleDB, sql } from "@cat/db";
import {
  VectorStorage,
  type CosineSimilarityContext,
  type InitContext,
  type RetrieveContext,
  type StoreContext,
  type UpdateDimensionContext,
} from "@cat/plugin-core";

export class Storage extends VectorStorage {
  getId(): string {
    return "pgvector-storage";
  }

  async store({ chunks }: StoreContext): Promise<void> {
    const { client: drizzle } = await getDrizzleDB();
    if (chunks.length === 0) {
      return;
    }

    const values = chunks.map(
      (chunk) => sql`(${JSON.stringify(chunk.vector)}, ${chunk.chunkId})`,
    );

    await drizzle.execute(sql`
      INSERT INTO "Vector" ("vector", "chunk_id")
      VALUES ${sql.join(values, sql`, `)}
      ON CONFLICT ("chunk_id") DO UPDATE SET "vector" = EXCLUDED."vector"
    `);
  }

  async retrieve({
    chunkIds,
  }: RetrieveContext): Promise<{ vector: number[]; chunkId: number }[]> {
    const { client: drizzle } = await getDrizzleDB();

    if (chunkIds.length === 0) {
      return [];
    }

    const result = await drizzle.execute<{
      vector: string | number[];
      chunkId: number;
    }>(sql`
      SELECT "vector", "chunk_id" as "chunkId" FROM "Vector"
      WHERE "chunk_id" IN (${sql.join(
        chunkIds.map((id) => sql`${id}`),
        sql`, `,
      )})
    `);

    return result.rows.map((row) => ({
      chunkId: row.chunkId,
      vector:
        typeof row.vector === "string" ? JSON.parse(row.vector) : row.vector,
    }));
  }

  async cosineSimilarity({
    vectors,
    chunkIdRange,
    minSimilarity,
    maxAmount,
  }: CosineSimilarityContext): Promise<
    { chunkId: number; similarity: number }[]
  > {
    if (chunkIdRange.length === 0) {
      return [];
    }

    const { client: drizzle } = await getDrizzleDB();

    const similarities = vectors.map(
      (embedding) => sql`1 - ("vector" <=> ${JSON.stringify(embedding)})`,
    );

    const maxSimilarity = sql`GREATEST(${sql.join(similarities, sql`, `)})`;

    const result = await drizzle.execute<{
      chunkId: number;
      similarity: number;
    }>(sql`
      SELECT "chunk_id" as "chunkId", ${maxSimilarity} as "similarity"
      FROM "Vector"
      WHERE "chunk_id" IN (${sql.join(
        chunkIdRange.map((id) => sql`${id}`),
        sql`, `,
      )})
        AND ${maxSimilarity} > ${minSimilarity}
      ORDER BY "similarity" DESC
      LIMIT ${maxAmount}
    `);

    return result.rows;
  }

  async updateDimension(ctx: UpdateDimensionContext): Promise<void> {
    const { client: drizzle } = await getDrizzleDB();
    await drizzle.execute(
      sql`ALTER TABLE "Vector" ALTER COLUMN vector TYPE vector(${sql.raw(
        ctx.dimension.toString(),
      )})`,
    );
  }

  async init(ctx: InitContext): Promise<void> {
    const { client: drizzle } = await getDrizzleDB();

    await drizzle.execute(sql`CREATE EXTENSION IF NOT EXISTS vector`);
    await drizzle.execute(sql`
      CREATE TABLE IF NOT EXISTS "Vector" (
        "id" serial PRIMARY KEY,
        "vector" vector(${sql.raw(ctx.dimension.toString())}) NOT NULL,
        "chunk_id" integer NOT NULL REFERENCES "Chunk"("id") ON DELETE CASCADE ON UPDATE CASCADE
      )
    `);
    await drizzle.execute(sql`
      CREATE INDEX IF NOT EXISTS "embeddingIndex" ON "Vector" USING hnsw ("vector" vector_cosine_ops)
    `);
    await drizzle.execute(sql`
      CREATE UNIQUE INDEX IF NOT EXISTS "Vector_chunkId_unique" ON "Vector" ("chunk_id")
    `);
  }
}
