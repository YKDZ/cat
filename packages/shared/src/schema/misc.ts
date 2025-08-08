import { z } from "zod";

export const PrismaErrorSchema = z.object({
  code: z.string(),
  meta: z.string(),
  message: z.string(),
  clientVersion: z.string(),
});

export const PrimsaDateTime = z.date().or(z.iso.datetime());

export const TranslationAdvisorDataSchema = z.object({
  id: z.string(),
  name: z.string(),
});

export const AuthMethodSchema = z.object({
  providerId: z.string(),
  providerType: z.string(),
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
  meta: z.json(),
});

export const TranslationSuggestionSchema = z.object({
  from: z.string(),
  value: z.string(),
  status: TranslationSuggestionStatusSchema,
});

export const MemorySuggestionSchema = z.object({
  source: z.string(),
  translation: z.string(),
  memoryId: z.ulid(),
  translatorId: z.ulid(),
  similarity: z.number().min(0).max(1),
});

export const UnvectorizedTextDataSchema = z.object({
  value: z.string(),
  meta: z.json().nullable(),
});

export const TermDataSchema = z.object({
  term: z.string(),
  termLanguageId: z.string(),
  translation: z.string(),
  translationLanguageId: z.string(),
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
export type TermData = z.infer<typeof TermDataSchema>;
export type AuthMethod = z.infer<typeof AuthMethodSchema>;
export type JSONType = z.infer<ReturnType<typeof z.json>>;
export type PrismaError = z.infer<typeof PrismaErrorSchema>;
export type TranslationAdvisorData = z.infer<
  typeof TranslationAdvisorDataSchema
>;
