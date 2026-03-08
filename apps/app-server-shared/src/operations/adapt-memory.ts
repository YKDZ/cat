/**
 * @module adapt-memory
 *
 * Single-step LLM-based memory adaptation operation.
 *
 * Given a source text and a fuzzy memory match (source + translation),
 * asks the LLM to adapt the stored translation to fit the current source.
 *
 * Uses `LLM_PROVIDER` directly via PluginManager — no full agent loop needed
 * for this single-turn task.
 */
import { PluginManager } from "@cat/plugin-core";
import { logger } from "@cat/shared/utils";
import * as z from "zod";

import type { OperationContext } from "@/operations/types";

export const AdaptMemoryInputSchema = z.object({
  /** Current source text to translate. */
  sourceText: z.string(),
  /** Source text of the recalled memory item. */
  memorySource: z.string(),
  /** Translation of the recalled memory item. */
  memoryTranslation: z.string(),
  /** Source language identifier (e.g. "en"). */
  sourceLanguageId: z.string(),
  /** Translation language identifier (e.g. "zh-Hans"). */
  translationLanguageId: z.string(),
});

export const AdaptMemoryOutputSchema = z.object({
  /** The adapted translation text, or null on failure. */
  adaptedTranslation: z.string().nullable(),
});

export type AdaptMemoryInput = z.infer<typeof AdaptMemoryInputSchema>;
export type AdaptMemoryOutput = z.infer<typeof AdaptMemoryOutputSchema>;

const SYSTEM_PROMPT = `You are a translation memory adaptation assistant.

Your task: Given a new source text and a similar previous translation memory entry,
adapt the stored translation to correctly translate the new source text.

Rules:
1. Preserve the style and terminology of the stored translation as much as possible.
2. Only change what is necessary to account for the differences between the old and new source texts.
3. Output ONLY the adapted translation text — no explanations, no quotes, no markup.
4. If the texts are too different to adapt reliably, output exactly: [SKIP]`;

const buildUserPrompt = (input: AdaptMemoryInput): string =>
  `Source language: ${input.sourceLanguageId}
Target language: ${input.translationLanguageId}

New source text:
${input.sourceText}

Previous source (from memory):
${input.memorySource}

Previous translation (from memory):
${input.memoryTranslation}

Please adapt the previous translation to fit the new source text.`;

/**
 * Adapt a memory translation to fit the current source text via LLM.
 *
 * Returns `{ adaptedTranslation: null }` when:
 * - No LLM_PROVIDER is available
 * - The LLM signals the texts are too different ([SKIP])
 * - Any error occurs during the LLM call
 */
export const adaptMemoryOp = async (
  input: AdaptMemoryInput,
  _ctx?: OperationContext,
): Promise<AdaptMemoryOutput> => {
  const pluginManager = PluginManager.get("GLOBAL", "");
  const llmServices = pluginManager.getServices("LLM_PROVIDER");

  if (llmServices.length === 0) {
    return { adaptedTranslation: null };
  }

  const llm = llmServices[0].service;

  try {
    const response = await llm.chat({
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: buildUserPrompt(input) },
      ],
      temperature: 0.3,
      maxTokens: 1024,
      // Disable extended thinking: some models (e.g. DeepSeek R1, Kimi)
      // reject non-streaming calls unless thinking is explicitly turned off.
      thinking: false,
    });

    const text = response.content?.trim() ?? "";

    if (!text || text === "[SKIP]") {
      return { adaptedTranslation: null };
    }

    return { adaptedTranslation: text };
  } catch (err: unknown) {
    logger.error("OP", { msg: "adaptMemoryOp: LLM call failed" }, err);
    return { adaptedTranslation: null };
  }
};
