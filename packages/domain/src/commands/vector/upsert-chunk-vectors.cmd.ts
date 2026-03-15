import { sql } from "@cat/db";
import * as z from "zod/v4";

import type { Command } from "@/types";

export const UpsertChunkVectorsCommandSchema = z.object({
  chunks: z.array(
    z.object({
      chunkId: z.int(),
      vector: z.array(z.number()),
    }),
  ),
});

export type UpsertChunkVectorsCommand = z.infer<
  typeof UpsertChunkVectorsCommandSchema
>;

export const upsertChunkVectors: Command<UpsertChunkVectorsCommand> = async (
  ctx,
  command,
) => {
  if (command.chunks.length === 0) {
    return {
      result: undefined,
      events: [],
    };
  }

  const values = command.chunks.map(
    (chunk) => sql`(${JSON.stringify(chunk.vector)}, ${chunk.chunkId})`,
  );

  await ctx.db.execute(sql`
    INSERT INTO "Vector" ("vector", "chunk_id")
    VALUES ${sql.join(values, sql`, `)}
    ON CONFLICT ("chunk_id") DO UPDATE SET "vector" = EXCLUDED."vector"
  `);

  return {
    result: undefined,
    events: [],
  };
};
