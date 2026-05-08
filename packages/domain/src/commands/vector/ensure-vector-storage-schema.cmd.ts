import { sql } from "@cat/db";
import * as z from "zod";

import type { Command } from "@/types";

export const EnsureVectorStorageSchemaCommandSchema = z.object({
  dimension: z.int().min(1),
});

export type EnsureVectorStorageSchemaCommand = z.infer<
  typeof EnsureVectorStorageSchemaCommandSchema
>;

export const ensureVectorStorageSchema: Command<
  EnsureVectorStorageSchemaCommand
> = async (ctx, command) => {
  // Extension is guaranteed by DB's  Docker image init script; this is a safety fallback.
  await ctx.db.execute(sql`CREATE EXTENSION IF NOT EXISTS vector`);

  // Create the table if it doesn't exist yet.
  await ctx.db.execute(sql`
    CREATE TABLE IF NOT EXISTS "Vector" (
      "id" serial PRIMARY KEY,
      "vector" vector(${sql.raw(command.dimension.toString())}) NOT NULL,
      "chunk_id" integer NOT NULL REFERENCES "Chunk"("id") ON DELETE CASCADE ON UPDATE CASCADE
    )
  `);

  // Check the current dimension of the vector column and ALTER if it differs.
  // For pgvector, atttypmod IS the dimension (stored directly, no offset).
  const result = await ctx.db.execute<{ typmod: number }>(sql`
    SELECT a.atttypmod AS typmod
    FROM pg_attribute a
    JOIN pg_class c ON c.oid = a.attrelid
    WHERE c.relname = 'Vector'
      AND a.attname = 'vector'
      AND a.attnum > 0
  `);

  const currentDimension =
    result.rows.length > 0 && result.rows[0].typmod > 0
      ? result.rows[0].typmod
      : null;

  if (currentDimension !== null && currentDimension !== command.dimension) {
    // Only ALTER if the table is empty; if it has data the dimension change must
    // go through updateVectorDimension which truncates first.
    const countResult = await ctx.db.execute<{ n: string }>(
      sql`SELECT COUNT(*) AS n FROM "Vector"`,
    );
    if (parseInt(countResult.rows[0].n) > 0) {
      throw new Error(
        `Vector table has data with dimension ${currentDimension} but ensureVectorStorageSchema was called with dimension ${command.dimension}. ` +
          `Call updateVectorDimension(${command.dimension}) explicitly to truncate and re-dimension.`,
      );
    }
    // Drop the HNSW index before altering the column type (required by pgvector).
    await ctx.db.execute(sql`DROP INDEX IF EXISTS "embeddingIndex"`);
    await ctx.db.execute(
      sql`ALTER TABLE "Vector" ALTER COLUMN vector TYPE vector(${sql.raw(command.dimension.toString())})`,
    );
  }

  await ctx.db.execute(sql`
    CREATE INDEX IF NOT EXISTS "embeddingIndex" ON "Vector" USING hnsw ("vector" vector_cosine_ops)
  `);
  await ctx.db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS "Vector_chunkId_unique" ON "Vector" ("chunk_id")
  `);

  return {
    result: undefined,
    events: [],
  };
};
