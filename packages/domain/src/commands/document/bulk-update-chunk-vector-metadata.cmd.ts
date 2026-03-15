import { chunk, inArray } from "@cat/db";
import * as z from "zod/v4";

import type { Command } from "@/types";

export const BulkUpdateChunkVectorMetadataCommandSchema = z.object({
  chunkIds: z.array(z.int()),
  vectorizerId: z.int(),
  vectorStorageId: z.int(),
});

export type BulkUpdateChunkVectorMetadataCommand = z.infer<
  typeof BulkUpdateChunkVectorMetadataCommandSchema
>;

export type BulkUpdateChunkVectorMetadataResult = {
  updatedCount: number;
};

export const bulkUpdateChunkVectorMetadata: Command<
  BulkUpdateChunkVectorMetadataCommand,
  BulkUpdateChunkVectorMetadataResult
> = async (ctx, command) => {
  if (command.chunkIds.length === 0) {
    return {
      result: { updatedCount: 0 },
      events: [],
    };
  }

  const updated = await ctx.db
    .update(chunk)
    .set({
      vectorizerId: command.vectorizerId,
      vectorStorageId: command.vectorStorageId,
    })
    .where(inArray(chunk.id, command.chunkIds))
    .returning({ id: chunk.id });

  return {
    result: { updatedCount: updated.length },
    events: [],
  };
};
