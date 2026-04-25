import { chunk, eq } from "@cat/db";
import { assertSingleOrNull } from "@cat/shared";
import * as z from "zod";

import type { Query } from "@/types";

export const GetChunkVectorStorageIdQuerySchema = z.object({
  chunkId: z.int(),
});

export type GetChunkVectorStorageIdQuery = z.infer<
  typeof GetChunkVectorStorageIdQuerySchema
>;

export const getChunkVectorStorageId: Query<
  GetChunkVectorStorageIdQuery,
  number | null
> = async (ctx, query) => {
  const row = assertSingleOrNull(
    await ctx.db
      .select({ vectorStorageId: chunk.vectorStorageId })
      .from(chunk)
      .where(eq(chunk.id, query.chunkId))
      .limit(1),
  );

  return row?.vectorStorageId ?? null;
};
