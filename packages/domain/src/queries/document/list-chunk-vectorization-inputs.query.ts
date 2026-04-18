import { chunk, chunkSet, eq, inArray, vectorizedString } from "@cat/db";
import * as z from "zod";

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
      text: vectorizedString.value,
      languageId: vectorizedString.languageId,
    })
    .from(chunk)
    .innerJoin(chunkSet, eq(chunk.chunkSetId, chunkSet.id))
    .innerJoin(vectorizedString, eq(vectorizedString.chunkSetId, chunkSet.id))
    .where(inArray(chunk.id, query.chunkIds));
};
