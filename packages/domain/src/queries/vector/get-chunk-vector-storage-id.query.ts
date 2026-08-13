import { chunk, eq } from "@cat/db";
import {
  assertSingleOrNull,
  type ServiceImplementationReference,
} from "@cat/shared";
import * as z from "zod";

import type { Query } from "#/types.ts";

export const GetChunkVectorStorageReferenceQuerySchema = z.object({
  chunkId: z.int(),
});

export type GetChunkVectorStorageReferenceQuery = z.infer<
  typeof GetChunkVectorStorageReferenceQuerySchema
>;

export const getChunkVectorStorageReference: Query<
  GetChunkVectorStorageReferenceQuery,
  ServiceImplementationReference | null
> = async (ctx, query) => {
  const row = assertSingleOrNull(
    await ctx.db
      .select({ vectorStorage: chunk.vectorStorage })
      .from(chunk)
      .where(eq(chunk.id, query.chunkId))
      .limit(1),
  );

  return row?.vectorStorage ?? null;
};
