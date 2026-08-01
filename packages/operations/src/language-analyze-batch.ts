import type { OperationContext } from "@cat/domain";
import {
  LanguageAnalysisBatchResultSchema,
  LanguageAnalysisVersionSchema,
  NormalizedLanguageIdSchema,
} from "@cat/shared";
import * as z from "zod";

import { type HostValidatedLanguageAnalysisBatchResult } from "./language-analysis-execution.ts";
import { executeRequiredLanguageAnalysisBatch } from "./language-analysis-requirement.ts";

export const LanguageAnalysisBatchInputSchema = z.strictObject({
  items: z
    .array(z.strictObject({ id: z.string(), text: z.string() }))
    .min(1)
    .refine(
      (items) => new Set(items.map((item) => item.id)).size === items.length,
      "Language Analysis batch item IDs must be unique.",
    ),
  languageId: NormalizedLanguageIdSchema,
  timeoutMs: z.int().positive().optional(),
});

export const LanguageAnalysisBatchOutputSchema =
  LanguageAnalysisBatchResultSchema.extend({
    languageAnalysisVersion: LanguageAnalysisVersionSchema,
  });
export type LanguageAnalysisBatchInput = z.input<
  typeof LanguageAnalysisBatchInputSchema
>;
export type LanguageAnalysisBatchOutput =
  HostValidatedLanguageAnalysisBatchResult;

/** Performs batch Language Analysis and validates each runtime attestation. */
export const languageAnalyzeBatchOp = async (
  input: LanguageAnalysisBatchInput,
  ctx?: OperationContext,
): Promise<LanguageAnalysisBatchOutput> => {
  const data = LanguageAnalysisBatchInputSchema.parse(input);
  return await executeRequiredLanguageAnalysisBatch(data, ctx);
};
