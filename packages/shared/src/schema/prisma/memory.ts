import z from "zod";
import { LanguageSchema } from "./misc.ts";
import { UserSchema } from "./user.ts";
import { PrismaDateTime } from "@/schema/misc.ts";

export const MemoryItemSchema = z.object({
  id: z.int(),
  createdAt: PrismaDateTime,
  updatedAt: PrismaDateTime,
  source: z.string(),
  sourceLanguageId: z.string(),
  get SourceLanguage() {
    return LanguageSchema.optional();
  },
  translation: z.string(),
  translationLanguageId: z.string(),
  get TranslationLanguage() {
    return LanguageSchema.optional();
  },
  sourceEmbeddingId: z.int(),
  get SourceEmbedding() {
    return z.array(z.number()).optional();
  },
  translationEmbeddingId: z.int(),
  get TranslationEmbedding() {
    return z.array(z.number()).optional();
  },
  memoryId: z.ulid(),
  creatorId: z.ulid(),
  get Creator() {
    return UserSchema.optional();
  },
});

export const MemorySchema = z.object({
  id: z.ulid(),
  name: z.string(),
  description: z.string().nullable(),
  createdAt: PrismaDateTime,
  updatedAt: PrismaDateTime,
  creatorId: z.ulid(),
  get Creator() {
    return UserSchema.optional();
  },
  get MemoryItems() {
    return z.array(MemoryItemSchema).optional();
  },
});

export type Memory = z.infer<typeof MemorySchema>;
export type MemoryItem = z.infer<typeof MemoryItemSchema>;
