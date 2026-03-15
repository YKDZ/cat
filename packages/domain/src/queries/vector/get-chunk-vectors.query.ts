import { sql } from "@cat/db";
import * as z from "zod/v4";

import type { Query } from "@/types";

export const GetChunkVectorsQuerySchema = z.object({
  chunkIds: z.array(z.int()),
});

export type GetChunkVectorsQuery = z.infer<typeof GetChunkVectorsQuerySchema>;

export type VectorChunk = {
  chunkId: number;
  vector: number[];
};

export const getChunkVectors: Query<
  GetChunkVectorsQuery,
  VectorChunk[]
> = async (ctx, query) => {
  if (query.chunkIds.length === 0) return [];

  const result = await ctx.db.execute<{
    vector: string | number[];
    chunkId: number;
  }>(sql`
    SELECT "vector", "chunk_id" as "chunkId" FROM "Vector"
    WHERE "chunk_id" IN (${sql.join(
      query.chunkIds.map((id) => sql`${id}`),
      sql`, `,
    )})
  `);

  return result.rows.map((row) => ({
    chunkId: row.chunkId,
    vector:
      typeof row.vector === "string" ? JSON.parse(row.vector) : row.vector,
  }));
};
