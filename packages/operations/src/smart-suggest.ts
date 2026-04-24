import type { OperationContext } from "@cat/domain";

import {
  collectLLMResponse,
  firstOrGivenService,
  resolvePluginManager,
} from "@cat/server-shared";
import { TranslationAdviseSchema } from "@cat/shared/schema/plugin";
import * as z from "zod";

// ─── Input schema ────────────────────────────────────────────────────────────

export const SmartSuggestInputSchema = z.object({
  sourceText: z.string().min(1),
  sourceLanguageId: z.string(),
  targetLanguageId: z.string(),

  /** Optional element metadata for prompt context (key–value pairs). */
  elementMeta: z.record(z.string(), z.unknown()).optional(),

  /**
   * Pre-recalled memory matches ordered by descending confidence.
   * Use `adaptedTranslation` when present.
   */
  memories: z
    .array(
      z.object({
        source: z.string(),
        translation: z.string(),
        adaptedTranslation: z.string().optional(),
        confidence: z.number().min(0).max(1),
      }),
    )
    .default([]),

  /**
   * Pre-recalled glossary terms.
   * MUST be applied in the generated translation.
   */
  terms: z
    .array(
      z.object({
        term: z.string(),
        translation: z.string(),
        definition: z.string().nullable(),
      }),
    )
    .default([]),

  /**
   * Approved translations of neighboring elements for consistency.
   */
  neighborTranslations: z
    .array(
      z.object({
        source: z.string(),
        translation: z.string(),
      }),
    )
    .default([]),

  llmProviderId: z.int().optional(),
  temperature: z.number().default(0.3),
  maxTokens: z.int().default(1024),
});

// ─── Output schema ───────────────────────────────────────────────────────────

export const SmartSuggestOutputSchema = z.object({
  /**
   * The generated suggestion, or null when no LLM provider is available
   * or the LLM call fails.
   */
  suggestion: TranslationAdviseSchema.extend({
    meta: z
      .object({
        /** Always "smart-suggestion" to distinguish from external advisors. */
        source: z.literal("smart-suggestion"),
        /** Which signal classes were available during generation. */
        signalClasses: z.array(z.enum(["memory", "term", "context", "source"])),
      })
      .optional(),
  }).nullable(),
});

export type SmartSuggestInput = z.input<typeof SmartSuggestInputSchema>;
export type SmartSuggestOutput = z.infer<typeof SmartSuggestOutputSchema>;

// ─── Confidence derivation ───────────────────────────────────────────────────

/**
 * Derive a confidence score for a Smart Suggestion.
 *
 * Policy (spec §"Confidence Semantics"):
 * - Strong memory support (≥ 0.9) raises confidence significantly.
 * - Medium memory support (≥ 0.7) provides a moderate boost.
 * - Absence of memory reduces confidence but does not forbid generation.
 * - Terms and neighbor context add a small positive signal.
 * - Hard cap at 0.85 to avoid overclaiming generative output.
 */
export const deriveSmartSuggestConfidence = (
  memories: SmartSuggestInput["memories"],
  terms: SmartSuggestInput["terms"],
  neighborTranslations: SmartSuggestInput["neighborTranslations"],
): number => {
  const mems = memories ?? [];
  const trms = terms ?? [];
  const neighbors = neighborTranslations ?? [];
  const topMemoryConf = mems[0]?.confidence ?? 0;

  let base: number;
  if (topMemoryConf >= 0.9) {
    base = 0.82;
  } else if (topMemoryConf >= 0.7) {
    base = 0.68;
  } else if (topMemoryConf > 0) {
    base = 0.57;
  } else {
    base = 0.5;
  }

  if (trms.length > 0) base = Math.min(base + 0.03, 0.85);
  if (neighbors.length > 0) base = Math.min(base + 0.02, 0.85);

  return parseFloat(base.toFixed(4));
};

// ─── Prompt builder ──────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a professional translator.
Rules:
1. Output ONLY the translation text — no explanations, quotes, or additional markup.
2. You MUST use any provided glossary terms exactly as given.
3. If a memory match is provided, treat it as a strong reference and adapt it to the current source text.
4. Maintain consistency with neighboring translations when provided.`;

const buildUserPrompt = (
  input: z.infer<typeof SmartSuggestInputSchema>,
): string => {
  let prompt = `Translate from ${input.sourceLanguageId} to ${input.targetLanguageId}.\n\n`;
  prompt += `Source text:\n${input.sourceText}\n`;

  const topMemory = input.memories[0];
  if (topMemory) {
    const memoryTranslation =
      topMemory.adaptedTranslation ?? topMemory.translation;
    prompt += `\nTranslation memory reference (adapt to the current source text):\n`;
    prompt += `  Source:      ${topMemory.source}\n`;
    prompt += `  Translation: ${memoryTranslation}\n`;
  }

  if (input.terms.length > 0) {
    prompt += `\nGlossary (MUST use these terms exactly):\n`;
    for (const t of input.terms) {
      prompt += `  "${t.term}" → "${t.translation}"`;
      if (t.definition) prompt += ` (${t.definition})`;
      prompt += `\n`;
    }
  }

  if (input.neighborTranslations.length > 0) {
    prompt += `\nNeighboring translations (for consistency):\n`;
    for (const n of input.neighborTranslations) {
      prompt += `  "${n.source}" → "${n.translation}"\n`;
    }
  }

  prompt += `\nOutput only the translation:`;
  return prompt;
};

// ─── Operation ───────────────────────────────────────────────────────────────

/**
 * @zh 智能翻译建议（内置首方建议源）。
 *
 * 汇总翻译记忆、术语、元素元数据和上下文信息，调用一次 LLM 生成翻译建议。
 * 不执行内部 DB 查询 — 所有上下文由调用方预加载传入。
 * @en Built-in Smart Suggestion (first-party suggestion source).
 *
 * Combines pre-loaded memory matches, glossary terms, element metadata,
 * and neighbor context, then makes a single LLM call to produce one
 * suggestion. Performs no internal DB queries — all context is passed in.
 *
 * Returns `{ suggestion: null }` when no LLM_PROVIDER is available or
 * when the LLM call fails.
 *
 * @param data - {@zh 智能建议输入参数} {@en Smart suggestion input}
 * @param ctx  - {@zh 操作上下文} {@en Operation context}
 */
export const smartSuggestOp = async (
  data: SmartSuggestInput,
  ctx?: OperationContext,
): Promise<SmartSuggestOutput> => {
  const input = SmartSuggestInputSchema.parse(data);
  const pluginManager = resolvePluginManager(ctx?.pluginManager);
  const llmService = firstOrGivenService(
    pluginManager,
    "LLM_PROVIDER",
    input.llmProviderId,
  );

  if (!llmService) {
    return { suggestion: null };
  }

  // Build which signal classes are present (used in provenance metadata)
  const signalClasses: Array<"memory" | "term" | "context" | "source"> = [
    "source",
  ];
  if (input.memories.length > 0) signalClasses.push("memory");
  if (input.terms.length > 0) signalClasses.push("term");
  if (input.neighborTranslations.length > 0) signalClasses.push("context");

  const confidence = deriveSmartSuggestConfidence(
    input.memories,
    input.terms,
    input.neighborTranslations,
  );

  try {
    const response = await collectLLMResponse(
      llmService.service.chat({
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: buildUserPrompt(input) },
        ],
        temperature: input.temperature,
        maxTokens: input.maxTokens,
        thinking: false,
      }),
    );

    const translation = (response.content ?? "").trim();
    if (!translation) {
      return { suggestion: null };
    }

    return {
      suggestion: {
        translation,
        confidence,
        meta: {
          source: "smart-suggestion" as const,
          signalClasses,
        },
      },
    };
  } catch {
    return { suggestion: null };
  }
};
