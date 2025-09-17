import z from "zod";
import { LanguageSchema } from "./misc.ts";
import { UserSchema } from "./user.ts";
import { TranslatableElementSchema } from "./document.ts";
import { VectorSchema } from "./vector.ts";
import { PrismaDateTime } from "@/schema/misc.ts";
import { PluginServiceSchema } from "@/schema/prisma/plugin.ts";

export const TranslationVoteSchema = z.object({
  id: z.int(),
  value: z.int(),
  createdAt: PrismaDateTime,
  updatedAt: PrismaDateTime,
  voterId: z.ulid(),
  translationId: z.int(),
});

export const TranslationApprovementSchema = z.object({
  id: z.int(),
  isActive: z.boolean(),
  createdAt: PrismaDateTime,
  updatedAt: PrismaDateTime,
  translationId: z.int(),

  creatorId: z.ulid(),
  get Creator() {
    return UserSchema.optional();
  },
});

export const TranslationSchema = z.object({
  id: z.int(),
  value: z.string(),
  meta: z.json().nullable(),
  createdAt: PrismaDateTime,
  updatedAt: PrismaDateTime,

  translatorId: z.ulid(),
  get Translator() {
    return UserSchema.optional();
  },

  translatableElementId: z.int(),
  get TranslatableElement() {
    return TranslatableElementSchema.optional();
  },

  languageId: z.string(),
  get Language() {
    return LanguageSchema.optional();
  },

  embeddingId: z.int().nullable(),
  get Embedding() {
    return VectorSchema.nullable().optional();
  },

  vectorizerId: z.int(),
  get Vectorizer() {
    return PluginServiceSchema.optional();
  },

  get Votes() {
    return z.array(TranslationVoteSchema).optional();
  },
  get Approvements() {
    return z.array(TranslationApprovementSchema).optional();
  },
});

export type Translation = z.infer<typeof TranslationSchema>;
export type TranslationApprovement = z.infer<
  typeof TranslationApprovementSchema
>;
export type TranslationVote = z.infer<typeof TranslationVoteSchema>;
