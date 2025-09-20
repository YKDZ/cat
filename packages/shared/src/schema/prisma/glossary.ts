import * as z from "zod/v4";
import { PrismaDateTime } from "@/schema/misc.ts";

export const TermSchema = z.object({
  id: z.int(),
  value: z.string(),
  context: z.string().optional().nullable(),
  createdAt: PrismaDateTime,
  updatedAt: PrismaDateTime,
  glossaryId: z.ulid(),

  languageId: z.string(),

  creatorId: z.ulid(),
});

export const TermRelationSchema = z.object({
  termId: z.int(),
  translationId: z.int(),
});

export const GlossarySchema = z.object({
  id: z.ulid(),
  name: z.string(),
  description: z.string().nullable(),
  createdAt: PrismaDateTime,
  updatedAt: PrismaDateTime,
  creatorId: z.ulid(),
});

export type Term = z.infer<typeof TermSchema>;
export type TermRelation = z.infer<typeof TermRelationSchema>;
export type Glossary = z.infer<typeof GlossarySchema>;
