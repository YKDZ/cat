import { chunk, inArray } from "@cat/db";
import { ServiceImplementationReferenceSchema } from "@cat/shared";
import * as z from "zod";

import type { Command } from "#/types.ts";

export const BulkUpdateChunkVectorMetadataCommandSchema = z.object({
  chunkIds: z.array(z.int()),
  vectorizer: ServiceImplementationReferenceSchema,
  vectorStorage: ServiceImplementationReferenceSchema,
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
      vectorizer: command.vectorizer,
      vectorStorage: command.vectorStorage,
    })
    .where(inArray(chunk.id, command.chunkIds))
    .returning({ id: chunk.id });

  return {
    result: { updatedCount: updated.length },
    events: [],
  };
};
