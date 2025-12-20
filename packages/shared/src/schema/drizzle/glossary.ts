import * as z from "zod/v4";
import { DrizzleDateTimeSchema } from "@/schema/misc.ts";
import { safeZDotJson } from "@/schema/json";

export const TermSchema = z.object({
  id: z.int(),
  stringId: z.int(),
  creatorId: z.uuidv4(),
  termEntryId: z.int(),
  createdAt: DrizzleDateTimeSchema,
  updatedAt: DrizzleDateTimeSchema,
});

export const TermEntrySchema = z.object({
  id: z.int(),
  meta: safeZDotJson,
  glossaryId: z.uuidv4(),
  createdAt: DrizzleDateTimeSchema,
  updatedAt: DrizzleDateTimeSchema,
});

export const GlossarySchema = z.object({
  id: z.uuidv4(),
  name: z.string(),
  description: z.string().nullable(),
  creatorId: z.uuidv4(),
  createdAt: DrizzleDateTimeSchema,
  updatedAt: DrizzleDateTimeSchema,
});

export type Term = z.infer<typeof TermSchema>;
export type TermEntry = z.infer<typeof TermEntrySchema>;
export type Glossary = z.infer<typeof GlossarySchema>;
