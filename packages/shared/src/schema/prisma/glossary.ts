import z from "zod";
import { LanguageSchema } from "./misc.ts";
import { UserSchema } from "./user.ts";
import { PrismaDateTime } from "@/schema/misc.ts";

export const TermSchema = z.object({
  id: z.int(),
  value: z.string(),
  context: z.string().optional().nullable(),
  createdAt: PrismaDateTime,
  updatedAt: PrismaDateTime,
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
  createdAt: PrismaDateTime,
  updatedAt: PrismaDateTime,
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
