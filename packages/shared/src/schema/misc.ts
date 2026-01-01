import * as z from "zod/v4";
import { safeZDotJson } from "@/schema/json.ts";

export const DrizzleDateTimeSchema = z.date();

export const TranslationAdvisorDataSchema = z.object({
  id: z.int(),
  name: z.string(),
});

export const AuthMethodSchema = z.object({
  providerId: z.int(),
  name: z.string(),
  icon: z.string(),
});

export const ElementTranslationStatusSchema = z.enum([
  "NO",
  "TRANSLATED",
  "APPROVED",
]);

export const TranslationSuggestionStatusSchema = z.enum(["ERROR", "SUCCESS"]);

export const TranslatableElementDataSchema = z.object({
  value: z.string(),
  sortIndex: z.int().optional(),
  languageId: z.string(),
  meta: safeZDotJson,
});

export const TranslationSuggestionSchema = z.object({
  from: z.string(),
  value: z.string(),
  status: TranslationSuggestionStatusSchema,
});

export const MemorySuggestionSchema = z.object({
  id: z.int(),
  translationChunkSetId: z.int(),
  source: z.string(),
  translation: z.string(),
  memoryId: z.uuidv4(),
  creatorId: z.uuidv4().nullable(),
  similarity: z.number().min(0).max(1),
  createdAt: DrizzleDateTimeSchema,
  updatedAt: DrizzleDateTimeSchema,
});

export const UnvectorizedTextDataSchema = z.object({
  text: z.string(),
  languageId: z.string(),
});

export const VectorizedTextDataSchema = z.array(
  z.object({
    meta: safeZDotJson,
    vector: z.array(z.number()),
  }),
);

export const TermDataSchema = z.object({
  term: z.string(),
  termLanguageId: z.string(),
  translation: z.string(),
  translationLanguageId: z.string(),
  subject: z.string().nullish(),
});

export const FileMetaSchema = z.object({
  name: z.string(),
  mimeType: z.string(),
  size: z.number(),
});

export type FileMeta = z.infer<typeof FileMetaSchema>;
export type TranslationSuggestion = z.infer<typeof TranslationSuggestionSchema>;
export type TranslatableElementData = z.infer<
  typeof TranslatableElementDataSchema
>;
export type ElementTranslationStatus = z.infer<
  typeof ElementTranslationStatusSchema
>;
export type MemorySuggestion = z.infer<typeof MemorySuggestionSchema>;
export type TranslationSuggestionStatus = z.infer<
  typeof TranslationSuggestionStatusSchema
>;
export type UnvectorizedTextData = z.infer<typeof UnvectorizedTextDataSchema>;
export type VectorizedTextData = z.infer<typeof VectorizedTextDataSchema>;
export type TermData = z.infer<typeof TermDataSchema>;
export type AuthMethod = z.infer<typeof AuthMethodSchema>;
export type TranslationAdvisorData = z.infer<
  typeof TranslationAdvisorDataSchema
>;
