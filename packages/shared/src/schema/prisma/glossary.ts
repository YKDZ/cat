import z from "zod";
import { PrimsaDateTime } from "../misc";
import { LanguageSchema } from "./misc";
import { UserSchema } from "./user";

export const TermSchema = z.object({
  id: z.int(),
  value: z.string(),
  context: z.string().optional().nullable(),
  createdAt: PrimsaDateTime,
  updatedAt: PrimsaDateTime,
  glossaryId: z.ulid(),
  languageId: z.string(),
  get Language() {
    return LanguageSchema.optional();
  },
  creatorId: z.ulid(),
  get Creator() {
    return UserSchema.optional();
  },
});

export const TermRelationSchema = z.object({
  termId: z.int(),
  get Term() {
    return TermSchema.optional();
  },
  translationId: z.int(),
  get Translation() {
    return TermSchema.optional();
  },
});

export const GlossarySchema = z.object({
  id: z.ulid(),
  name: z.string(),
  description: z.string().nullable(),
  createdAt: PrimsaDateTime,
  updatedAt: PrimsaDateTime,
  creatorId: z.ulid(),
  get Creator() {
    return UserSchema.optional();
  },
  get GlossaryItems() {
    return z.array(TermSchema).optional();
  },
});

export type Term = z.infer<typeof TermSchema>;
export type TermRelation = z.infer<typeof TermRelationSchema>;
export type Glossary = z.infer<typeof GlossarySchema>;
