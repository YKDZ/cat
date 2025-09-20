import * as z from "zod/v4";
import { LanguageSchema } from "./misc.ts";
import { UserSchema } from "./user.ts";
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
  memoryId: z.ulid(),
  creatorId: z.ulid(),
});

export const MemorySchema = z.object({
  id: z.ulid(),
  name: z.string(),
  description: z.string().nullable(),
  createdAt: PrismaDateTime,
  updatedAt: PrismaDateTime,

  creatorId: z.ulid(),
});

export type Memory = z.infer<typeof MemorySchema>;
export type MemoryItem = z.infer<typeof MemoryItemSchema>;
