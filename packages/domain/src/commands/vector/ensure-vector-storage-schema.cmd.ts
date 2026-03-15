import { sql } from "@cat/db";
import * as z from "zod/v4";

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
  await ctx.db.execute(sql`CREATE EXTENSION IF NOT EXISTS vector`);
  await ctx.db.execute(sql`
    CREATE TABLE IF NOT EXISTS "Vector" (
      "id" serial PRIMARY KEY,
      "vector" vector(${sql.raw(command.dimension.toString())}) NOT NULL,
      "chunk_id" integer NOT NULL REFERENCES "Chunk"("id") ON DELETE CASCADE ON UPDATE CASCADE
    )
  `);
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
