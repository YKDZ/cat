import * as z from "zod/v4";
import { DrizzleDateTimeSchema } from "@/schema/misc.ts";

export const TermSchema = z.object({
  id: z.int(),
  stringId: z.int(),
  glossaryId: z.uuidv7(),
  creatorId: z.uuidv7(),
  createdAt: DrizzleDateTimeSchema,
  updatedAt: DrizzleDateTimeSchema,
});

export const TermRelationSchema = z.object({
  termId: z.int(),
  translationId: z.int(),
});

export const GlossarySchema = z.object({
  id: z.uuidv7(),
  name: z.string(),
  description: z.string().nullable(),
  creatorId: z.uuidv7(),
  createdAt: DrizzleDateTimeSchema,
  updatedAt: DrizzleDateTimeSchema,
});

export type Term = z.infer<typeof TermSchema>;
export type TermRelation = z.infer<typeof TermRelationSchema>;
export type Glossary = z.infer<typeof GlossarySchema>;
