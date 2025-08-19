import z from "zod";
import { LanguageSchema } from "./misc";
import { UserSchema } from "./user";
import { TranslatableElementSchema } from "./document";
import { PrimsaDateTime } from "../misc";
import { VectorSchema } from "./vector";

export const TranslationVoteSchema = z.object({
  id: z.int(),
  value: z.int(),
  createdAt: PrimsaDateTime,
  updatedAt: PrimsaDateTime,
  voterId: z.ulid(),
  translationId: z.int(),
});

export const TranslationApprovmentSchema = z.object({
  id: z.int(),
  isActive: z.boolean(),
  createdAt: PrimsaDateTime,
  updatedAt: PrimsaDateTime,
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
  createdAt: PrimsaDateTime,
  updatedAt: PrimsaDateTime,
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
  get Votes() {
    return z.array(TranslationVoteSchema).optional();
  },
  get Approvments() {
    return z.array(TranslationApprovmentSchema).optional();
  },
});

export type Translation = z.infer<typeof TranslationSchema>;
export type TranslationApprovment = z.infer<typeof TranslationApprovmentSchema>;
export type TranslationVote = z.infer<typeof TranslationVoteSchema>;
