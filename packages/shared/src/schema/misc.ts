import { z } from "zod";

export const ElementTranslationStatusSchema = z.enum([
  "NO",
  "TRANSLATED",
  "APPROVED",
]);

export const TranslationSuggestionStatusSchema = z.enum(["ERROR", "SUCCESS"]);

export const TranslatableElementDataSchema = z.object({
  value: z.string(),
  meta: z.string(),
});

export const TranslationSuggestionSchema = z.object({
  from: z.string(),
  value: z.string(),
  status: TranslationSuggestionStatusSchema,
});

export const MemorySuggestionSchema = z.object({
  source: z.string(),
  translation: z.string(),
  memoryId: z.number(),
  translatorId: z.string().cuid2(),
  similarity: z.number(),
});

export const UnvectorizedElementDataSchema = z.object({
  value: z.string(),
  meta: z.string(),
  documentId: z.string(),
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
export type UnvectorizedElementData = z.infer<
  typeof UnvectorizedElementDataSchema
>;
