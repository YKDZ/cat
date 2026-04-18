import { sql } from "@cat/db";
import * as z from "zod";

import type { Query } from "@/types";

export const SearchChunkCosineSimilarityQuerySchema = z.object({
  vectors: z.array(z.array(z.number())),
  chunkIdRange: z.array(z.int()),
  minSimilarity: z.number().min(0).max(1),
  maxAmount: z.int().min(1),
});

export type SearchChunkCosineSimilarityQuery = z.infer<
  typeof SearchChunkCosineSimilarityQuerySchema
>;

export type ChunkCosineSimilarityItem = {
  chunkId: number;
  similarity: number;
};

export const searchChunkCosineSimilarity: Query<
  SearchChunkCosineSimilarityQuery,
  ChunkCosineSimilarityItem[]
> = async (ctx, query) => {
  if (query.chunkIdRange.length === 0) return [];

  const similarities = query.vectors.map(
    (embedding) => sql`1 - ("vector" <=> ${JSON.stringify(embedding)})`,
  );
  const maxSimilarity = sql`GREATEST(${sql.join(similarities, sql`, `)})`;

  const result = await ctx.db.execute<ChunkCosineSimilarityItem>(sql`
    SELECT "chunk_id" as "chunkId", ${maxSimilarity} as "similarity"
    FROM "Vector"
    WHERE "chunk_id" IN (${sql.join(
      query.chunkIdRange.map((id) => sql`${id}`),
      sql`, `,
    )})
      AND ${maxSimilarity} > ${query.minSimilarity}
    ORDER BY "similarity" DESC
    LIMIT ${query.maxAmount}
  `);

  return result.rows;
};
