import z from "zod/v4";
import { LanguageSchema } from "./misc";
import { UserSchema } from "./user";
import { TranslatableElementSchema } from "./document";
import { PrimsaDateTime } from "../misc";

export const TranslationVoteSchema = z.object({
  id: z.int(),
  value: z.int(),
  createdAt: PrimsaDateTime,
  updatedAt: PrimsaDateTime,
  voterId: z.cuid2(),
  translationId: z.int(),
});

export const TranslationApprovmentSchema = z.object({
  id: z.int(),
  isActive: z.boolean(),
  createdAt: PrimsaDateTime,
  updatedAt: PrimsaDateTime,
  translationId: z.int(),
  userId: z.cuid2().nullable(),
});

export const TranslationSchema = z.object({
  id: z.int(),
  value: z.string(),
  meta: z.json().nullable(),
  createdAt: PrimsaDateTime,
  updatedAt: PrimsaDateTime,
  translatorId: z.cuid2(),
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
