import * as z from "zod/v4";
import { PrismaDateTime } from "@/schema/misc.ts";

export const MemoryItemSchema = z.object({
  id: z.int(),
  createdAt: PrismaDateTime,
  updatedAt: PrismaDateTime,
  source: z.string(),
  sourceLanguageId: z.string(),
  translation: z.string(),
  translationLanguageId: z.string(),
  sourceEmbeddingId: z.int(),
  translationEmbeddingId: z.int(),
  memoryId: z.uuidv7(),
  creatorId: z.uuidv7(),
});

export const MemorySchema = z.object({
  id: z.uuidv7(),
  name: z.string(),
  description: z.string().nullable(),
  createdAt: PrismaDateTime,
  updatedAt: PrismaDateTime,

  creatorId: z.uuidv7(),
});

export type Memory = z.infer<typeof MemorySchema>;
export type MemoryItem = z.infer<typeof MemoryItemSchema>;
