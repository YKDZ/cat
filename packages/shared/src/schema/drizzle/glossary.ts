import * as z from "zod/v4";

import { DrizzleDateTimeSchema } from "@/schema/misc.ts";

import { TermStatusSchema, TermTypeSchema } from "./enum";

export const TermSchema = z.object({
  id: z.int(),
  type: TermTypeSchema,
  status: TermStatusSchema,
  text: z.string(),
  languageId: z.string(),
  creatorId: z.uuidv4(),
  termConceptId: z.int(),
  createdAt: DrizzleDateTimeSchema,
  updatedAt: DrizzleDateTimeSchema,
});

export const TermConceptSchema = z.object({
  id: z.int(),
  definition: z.string().nullable(),
  stringId: z.int().nullable(),
  creatorId: z.uuidv4().nullable(),
  glossaryId: z.uuidv4(),
  createdAt: DrizzleDateTimeSchema,
  updatedAt: DrizzleDateTimeSchema,
});

export const TermConceptToSubjectSchema = z.object({
  termConceptId: z.int(),
  subjectId: z.int(),
  isPrimary: z.boolean(),
});

export const TermConceptSubjectSchema = z.object({
  id: z.int(),
  subject: z.string(),
  defaultDefinition: z.string().nullable(),
  creatorId: z.uuidv4(),
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
export type TermConcept = z.infer<typeof TermConceptSchema>;
export type TermConceptToSubject = z.infer<typeof TermConceptToSubjectSchema>;
export type TermConceptSubject = z.infer<typeof TermConceptSubjectSchema>;
export type Glossary = z.infer<typeof GlossarySchema>;
