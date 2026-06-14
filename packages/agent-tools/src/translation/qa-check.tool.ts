import type { AgentToolDefinition } from "@cat/agent";

import { qaOp, tokenizeOp } from "@cat/operations";
import * as z from "zod";

const qaCheckArgs = z.object({
  /**
   * Source text
   */
  sourceText: z.string().describe("Original source text"),
  /**
   * Source language ID (BCP-47)
   */
  sourceLanguageId: z
    .string()
    .optional()
    .describe("Source language ID (BCP-47)"),
  /**
   * Translated text to check
   */
  translatedText: z.string().describe("Translated text to QA-check"),
  /**
   * Target language ID (BCP-47)
   */
  targetLanguageId: z
    .string()
    .optional()
    .describe("Target language ID (BCP-47)"),
  /**
   * Glossary UUIDs for terminology consistency check
   */
  glossaryIds: z
    .array(z.uuid())
    .default([])
    .describe("Glossary UUIDs for terminology check"),
});

/**
 * qa_check tool: run QA checks on the translated text.
 */
export const qaCheckTool: AgentToolDefinition = {
  name: "qa_check",
  description:
    "Run QA checks on the translated text. Returns a list of QA issues found (empty list means QA passed).",
  parameters: qaCheckArgs,
  sideEffectType: "none",
  toolSecurityLevel: "standard",
  async execute(args, ctx) {
    const parsed = qaCheckArgs.parse(args);
    const sourceLanguageId =
      parsed.sourceLanguageId ?? ctx.session.sourceLanguageId;
    const targetLanguageId = parsed.targetLanguageId ?? ctx.session.languageId;

    if (!sourceLanguageId || !targetLanguageId) {
      throw new Error(
        "qa_check requires sourceLanguageId and targetLanguageId",
      );
    }

    // Tokenize source and translation in parallel
    const [sourceTokens, translationTokens] = await Promise.all([
      tokenizeOp({ text: parsed.sourceText }),
      tokenizeOp({ text: parsed.translatedText }),
    ]);

    const result = await qaOp({
      source: {
        languageId: sourceLanguageId,
        text: parsed.sourceText,
        tokens: sourceTokens.tokens,
      },
      translation: {
        languageId: targetLanguageId,
        text: parsed.translatedText,
        tokens: translationTokens.tokens,
      },
      glossaryIds: parsed.glossaryIds,
    });

    const passed = result.result.length === 0;
    return { passed, issues: result.result };
  },
};
