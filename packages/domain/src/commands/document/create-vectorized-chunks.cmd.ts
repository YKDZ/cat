import type { JSONType } from "@cat/shared/schema/json";

import { chunk, chunkSet } from "@cat/db";
import * as z from "zod/v4";

import type { Command } from "@/types";

export const CreateVectorizedChunksCommandSchema = z.object({
  vectorizerId: z.int(),
  vectorStorageId: z.int(),
  chunkSetCount: z.int().min(1),
  chunks: z.array(
    z.object({
      textIndex: z.int().min(0),
      meta: z.json().optional(),
    }),
  ),
});

export type CreateVectorizedChunksCommand = z.infer<
  typeof CreateVectorizedChunksCommandSchema
>;

export type CreateVectorizedChunksResult = {
  chunkSetIds: number[];
  chunkIds: number[];
};

export const createVectorizedChunks: Command<
  CreateVectorizedChunksCommand,
  CreateVectorizedChunksResult
> = async (ctx, command) => {
  const insertedChunkSets = await ctx.db
    .insert(chunkSet)
    .values(Array.from({ length: command.chunkSetCount }, () => ({})))
    .returning({ id: chunkSet.id });

  const chunkSetIds = insertedChunkSets.map((item) => item.id);

  if (command.chunks.length === 0) {
    return {
      result: {
        chunkSetIds,
        chunkIds: [],
      },
      events: [],
    };
  }

  const rows = command.chunks.map((item, index) => {
    const mappedChunkSetId = chunkSetIds[item.textIndex];
    if (mappedChunkSetId === undefined) {
      throw new Error(
        `Invalid textIndex ${item.textIndex} for chunk at index ${index}`,
      );
    }

    return {
      chunkSetId: mappedChunkSetId,
      vectorizerId: command.vectorizerId,
      vectorStorageId: command.vectorStorageId,
      meta: (item.meta ?? {}) as JSONType,
    };
  });

  const insertedChunks = await ctx.db
    .insert(chunk)
    .values(rows)
    .returning({ id: chunk.id });

  return {
    result: {
      chunkSetIds,
      chunkIds: insertedChunks.map((item) => item.id),
    },
    events: [],
  };
};
