import { chunk, chunkSet, eq, inArray, translatableString } from "@cat/db";
import * as z from "zod/v4";

import type { Query } from "@/types";

export const ListChunkVectorizationInputsQuerySchema = z.object({
  chunkIds: z.array(z.int()),
});

export type ListChunkVectorizationInputsQuery = z.infer<
  typeof ListChunkVectorizationInputsQuerySchema
>;

export type ChunkVectorizationInput = {
  chunkId: number;
  text: string;
  languageId: string;
};

export const listChunkVectorizationInputs: Query<
  ListChunkVectorizationInputsQuery,
  ChunkVectorizationInput[]
> = async (ctx, query) => {
  if (query.chunkIds.length === 0) {
    return [];
  }

  return ctx.db
    .select({
      chunkId: chunk.id,
      text: translatableString.value,
      languageId: translatableString.languageId,
    })
    .from(chunk)
    .innerJoin(chunkSet, eq(chunk.chunkSetId, chunkSet.id))
    .innerJoin(
      translatableString,
      eq(translatableString.chunkSetId, chunkSet.id),
    )
    .where(inArray(chunk.id, query.chunkIds));
};
