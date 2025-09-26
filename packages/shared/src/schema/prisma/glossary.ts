import * as z from "zod/v4";
import { PrismaDateTime } from "@/schema/misc.ts";

export const TermSchema = z.object({
  id: z.int(),
  value: z.string(),
  context: z.string().optional().nullable(),
  createdAt: PrismaDateTime,
  updatedAt: PrismaDateTime,
  glossaryId: z.uuidv7(),

  languageId: z.string(),

  creatorId: z.uuidv7(),
});

export const TermRelationSchema = z.object({
  termId: z.int(),
  translationId: z.int(),
});

export const GlossarySchema = z.object({
  id: z.uuidv7(),
  name: z.string(),
  description: z.string().nullable(),
  createdAt: PrismaDateTime,
  updatedAt: PrismaDateTime,
  creatorId: z.uuidv7(),
});

export type Term = z.infer<typeof TermSchema>;
export type TermRelation = z.infer<typeof TermRelationSchema>;
export type Glossary = z.infer<typeof GlossarySchema>;
