import * as z from "zod/v4";
import { safeZDotJson } from "../json.ts";
import { DrizzleDateTimeSchema } from "../misc.ts";

export const ChunkSetSchema = z.object({
  id: z.int(),
  meta: safeZDotJson,
  createdAt: DrizzleDateTimeSchema,
  updatedAt: DrizzleDateTimeSchema,
});

export const ChunkSchema = z.object({
  id: z.int(),
  meta: safeZDotJson,
  createdAt: z.date(),
  updatedAt: z.date(),
  chunkSetId: z.int(),
  vectorizerId: z.int(),
});

export const VectorSchema = z.object({
  id: z.int(),
  vector: z.array(z.number()),
  chunkId: z.int(),
});

export type ChunkSet = z.infer<typeof ChunkSetSchema>;
export type Chunk = z.infer<typeof ChunkSchema>;
export type Vector = z.infer<typeof VectorSchema>;
