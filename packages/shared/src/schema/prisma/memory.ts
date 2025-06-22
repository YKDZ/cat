import z from "zod/v4";
import { LanguageSchema } from "./misc";
import { PrimsaDateTime } from "../misc";
import { UserSchema } from "./user";

export const MemoryItemSchema = z.object({
  id: z.int(),
  createdAt: PrimsaDateTime,
  updatedAt: PrimsaDateTime,
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
  memoryId: z.number(),
  creatorId: z.cuid2(),
  get Creator() {
    return UserSchema.optional();
  },
});

export const MemorySchema = z.object({
  id: z.cuid2(),
  name: z.string(),
  description: z.string().nullable(),
  createdAt: PrimsaDateTime,
  updatedAt: PrimsaDateTime,
  creatorId: z.cuid2(),
  get Creator() {
    return UserSchema.optional();
  },
  get MemoryItems() {
    return z.array(MemoryItemSchema).optional();
  },
});

export type Memory = z.infer<typeof MemorySchema>;
export type MemoryItem = z.infer<typeof MemoryItemSchema>;
