import * as z from "zod";

export const LookupTermsInputSchema = z.object({
  glossaryIds: z.array(z.string()),
  text: z.string(),
  sourceLanguageId: z.string(),
  translationLanguageId: z.string(),
  wordSimilarityThreshold: z.number().min(0).max(1).optional().default(0.3),
});

export const LookupTermsOutputSchema = z.array(
  z.object({
    term: z.string(),
    translation: z.string(),
    definition: z.string().nullable(),
    conceptId: z.int(),
    glossaryId: z.string(),
    confidence: z.number().min(0).max(1),
  }),
);

export type LookupTermsInput = z.input<typeof LookupTermsInputSchema>;
export type LookupTermsOutput = z.infer<typeof LookupTermsOutputSchema>;
