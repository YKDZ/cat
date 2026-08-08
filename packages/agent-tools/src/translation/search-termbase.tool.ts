import type { AgentToolDefinition } from "@cat/agent";
import {
  collectTermRecallOp,
  getTermRecallCandidates,
  RecallOperationFailureError,
} from "@cat/operations";
import * as z from "zod";

const searchTermbaseArgs = z.object({
  /**
   * Source text (used for term matching)
   */
  text: z.string().describe("Source text to search termbase for"),
  /**
   * Source language ID (BCP-47)
   */
  sourceLanguageId: z
    .string()
    .optional()
    .describe("Source language ID (BCP-47)"),
  /**
   * Target language ID (BCP-47)
   */
  translationLanguageId: z
    .string()
    .optional()
    .describe("Target language ID (BCP-47)"),
  /**
   * Glossary UUIDs to search
   */
  glossaryIds: z
    .array(z.uuid())
    .default([])
    .describe("Glossary UUIDs to search"),
  /**
   * Word similarity threshold (0–1, default 0.3)
   */
  wordSimilarityThreshold: z
    .number()
    .min(0)
    .max(1)
    .default(0.3)
    .describe("Word similarity threshold (0–1)"),
});

/**
 * search_termbase tool: search the termbase for terms occurring in the source text.
 */
export const searchTermbaseTool: AgentToolDefinition = {
  name: "search_termbase",
  description:
    "Search the termbase for terms found in the source text. Returns matched terms with their translations and definitions.",
  parameters: searchTermbaseArgs,
  sideEffectType: "none",
  toolSecurityLevel: "standard",
  async execute(args, ctx) {
    ctx.signal.throwIfAborted();
    const parsed = searchTermbaseArgs.parse(args);
    const sourceLanguageId =
      parsed.sourceLanguageId ?? ctx.session.sourceLanguageId;
    const translationLanguageId =
      parsed.translationLanguageId ?? ctx.session.languageId;

    if (!sourceLanguageId || !translationLanguageId) {
      throw new Error(
        "search_termbase requires sourceLanguageId and translationLanguageId",
      );
    }

    try {
      const result = await collectTermRecallOp(
        {
          text: parsed.text,
          sourceLanguageId,
          translationLanguageId,
          glossaryIds: parsed.glossaryIds,
          wordSimilarityThreshold: parsed.wordSimilarityThreshold,
        },
        {
          traceId: `agent-tool:${ctx.session.runId}:search-termbase`,
          signal: ctx.signal,
          pluginManager: ctx.pluginManager,
        },
      );
      ctx.signal.throwIfAborted();
      return { terms: getTermRecallCandidates(result) };
    } catch (error) {
      ctx.signal.throwIfAborted();
      if (error instanceof RecallOperationFailureError) {
        return { terms: [], operationFailure: error.failure };
      }
      throw error;
    }
  },
};
