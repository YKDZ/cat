import {
  LanguageAnalysisResultSchema,
  LanguageAnalysisVersionSchema,
  NormalizedLanguageIdSchema,
} from "@cat/shared";
import * as z from "zod";

import { type HostValidatedLanguageAnalysisResult } from "./language-analysis-execution.ts";
import {
  executeRequiredLanguageAnalysis,
  type LanguageAnalysisOperationContext,
} from "./language-analysis-requirement.ts";

export const LanguageAnalysisInputSchema = z.strictObject({
  text: z.string(),
  languageId: NormalizedLanguageIdSchema,
  timeoutMs: z.int().positive().optional(),
});

export const LanguageAnalysisOutputSchema = LanguageAnalysisResultSchema.extend(
  {
    languageAnalysisVersion: LanguageAnalysisVersionSchema,
  },
);

export type LanguageAnalysisInput = z.input<typeof LanguageAnalysisInputSchema>;
export type LanguageAnalysisOutput = HostValidatedLanguageAnalysisResult;

/** Performs full Language Analysis through a configured Language Analyzer. */
export const languageAnalyzeOp = async (
  input: LanguageAnalysisInput,
  ctx: LanguageAnalysisOperationContext,
): Promise<LanguageAnalysisOutput> => {
  const data = LanguageAnalysisInputSchema.parse(input);
  return await executeRequiredLanguageAnalysis(data, ctx);
};
