import type { AgentToolDefinition } from "@cat/agent";
import {
  collectMemoryRecallOp,
  getMemoryRecallCandidates,
  RecallOperationFailureError,
} from "@cat/operations";
import * as z from "zod";

const searchTmArgs = z.object({
  /**
   * Source text to search TM for
   */
  text: z.string().describe("Source text to search translation memory for"),
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
   * Translation memory bank UUIDs to search
   */
  memoryIds: z
    .array(z.uuid())
    .default([])
    .describe("Translation memory bank UUIDs"),
  /**
   * Minimum similarity threshold (0–1, default 0.72)
   */
  minSimilarity: z
    .number()
    .min(0)
    .max(1)
    .default(0.72)
    .describe("Minimum cosine similarity threshold (0–1)"),
  /**
   * Maximum number of matches to return (default 5)
   */
  maxAmount: z
    .int()
    .min(1)
    .default(5)
    .describe("Maximum number of TM matches to return"),
});

/**
 * search_tm tool: search translation memory banks via three channels (exact, trgm, vector semantic).
 */
export const searchTmTool: AgentToolDefinition = {
  name: "search_tm",
  description:
    "Search translation memory banks for existing translations of the source text. Uses three-channel matching (exact, trigram similarity, vector semantic). Returns ranked matches with source text, translation, and confidence scores.",
  parameters: searchTmArgs,
  sideEffectType: "none",
  toolSecurityLevel: "standard",
  async execute(args, ctx) {
    ctx.signal.throwIfAborted();
    const parsed = searchTmArgs.parse(args);
    const sourceLanguageId =
      parsed.sourceLanguageId ?? ctx.session.sourceLanguageId;
    const translationLanguageId =
      parsed.translationLanguageId ?? ctx.session.languageId;

    if (!sourceLanguageId || !translationLanguageId) {
      throw new Error(
        "search_tm requires sourceLanguageId and translationLanguageId",
      );
    }

    try {
      const recallResult = await collectMemoryRecallOp(
        {
          text: parsed.text,
          sourceLanguageId,
          translationLanguageId,
          memoryIds: parsed.memoryIds,
          minSimilarity: parsed.minSimilarity,
          maxAmount: parsed.maxAmount,
        },
        {
          traceId: `agent-tool:${ctx.session.runId}:search-tm`,
          signal: ctx.signal,
          pluginManager: ctx.pluginManager,
        },
      );
      ctx.signal.throwIfAborted();
      const matches = getMemoryRecallCandidates(recallResult);
      return {
        memories: matches.map((match) => ({
          source: match.source,
          translation: match.adaptedTranslation ?? match.translation,
          confidence: match.confidence,
          memoryId: match.memoryId,
          evidences: match.evidences,
          matchedText: match.matchedText,
          matchedVariantText: match.matchedVariantText,
          matchedVariantType: match.matchedVariantType,
        })),
      };
    } catch (error) {
      ctx.signal.throwIfAborted();
      if (error instanceof RecallOperationFailureError) {
        return { memories: [], operationFailure: error.failure };
      }
      throw error;
    }
  },
};
