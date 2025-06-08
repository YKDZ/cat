import { z } from "zod/v4";

export const AuthMethodSchema = z.object({
  id: z.string(),
  type: z.string(),
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
  memoryId: z.cuid2(),
  translatorId: z.cuid2(),
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
