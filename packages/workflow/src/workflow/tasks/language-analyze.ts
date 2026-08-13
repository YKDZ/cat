import {
  languageAnalyzeBatchOp,
  languageAnalyzeOp,
  LanguageAnalysisOperationFailureError,
  LanguageAnalysisBatchInputSchema,
  LanguageAnalysisBatchOutputSchema,
  LanguageAnalysisInputSchema,
  LanguageAnalysisOutputSchema,
  mapLanguageAnalysisOperationFailure,
} from "@cat/operations";

import { requireWorkflowDatabase } from "#/graph/dsl/database-context.ts";
import { defineNode, defineGraph } from "#/graph/dsl/index.ts";

export {
  LanguageAnalysisInputSchema,
  LanguageAnalysisOutputSchema,
  LanguageAnalysisBatchInputSchema,
  LanguageAnalysisBatchOutputSchema,
};

/** Keeps classified failures typed so the owning boundary can persist them. */
export const exposeLanguageAnalysisOperationFailure = (
  error: unknown,
): never => {
  const failure = mapLanguageAnalysisOperationFailure(error, []);
  if (failure === undefined) throw error;
  throw new LanguageAnalysisOperationFailureError(failure, { cause: error });
};

export const languageAnalyzeGraph = defineGraph({
  id: "language-analyze",
  input: LanguageAnalysisInputSchema,
  output: LanguageAnalysisOutputSchema,
  nodes: {
    main: defineNode({
      input: LanguageAnalysisInputSchema,
      output: LanguageAnalysisOutputSchema,
      handler: async (input, ctx) => {
        try {
          return await languageAnalyzeOp(input, {
            db: requireWorkflowDatabase(ctx),
            traceId: ctx.traceId,
            signal: ctx.signal,
            pluginManager: ctx.pluginManager,
          });
        } catch (error) {
          return exposeLanguageAnalysisOperationFailure(error);
        }
      },
    }),
  },
  edges: [],
  entry: "main",
  exit: ["main"],
});

export const languageAnalyzeBatchGraph = defineGraph({
  id: "language-analyze-batch",
  input: LanguageAnalysisBatchInputSchema,
  output: LanguageAnalysisBatchOutputSchema,
  nodes: {
    main: defineNode({
      input: LanguageAnalysisBatchInputSchema,
      output: LanguageAnalysisBatchOutputSchema,
      handler: async (input, ctx) => {
        try {
          return await languageAnalyzeBatchOp(input, {
            db: requireWorkflowDatabase(ctx),
            traceId: ctx.traceId,
            signal: ctx.signal,
            pluginManager: ctx.pluginManager,
          });
        } catch (error) {
          return exposeLanguageAnalysisOperationFailure(error);
        }
      },
    }),
  },
  edges: [],
  entry: "main",
  exit: ["main"],
});
