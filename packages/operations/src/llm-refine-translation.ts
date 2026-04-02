import type { OperationContext } from "@cat/domain";

import { firstOrGivenService, resolvePluginManager } from "@cat/server-shared";
import * as z from "zod";

const DEFAULT_REFINE_SYSTEM_PROMPT = `You are an expert translation post-editor. Your task is to refine a machine-generated or memory-matched translation.

Rules:
1. Preserve the meaning of the source text exactly.
2. You MUST use the provided glossary terms in your translation. Do not deviate from the given terminology.
3. Ensure natural, fluent expression in the target language.
4. Maintain consistency with neighboring translations if provided.
5. Return ONLY the refined translation text, nothing else.`;

export const LlmRefineTranslationInputSchema = z.object({
  sourceText: z.string(),
  sourceLanguageId: z.string(),
  targetLanguageId: z.string(),
  candidateTranslation: z.string(),
  terms: z.array(
    z.object({
      term: z.string(),
      translation: z.string(),
      definition: z.string().nullable(),
    }),
  ),
  neighborTranslations: z
    .array(
      z.object({
        source: z.string(),
        translation: z.string(),
      }),
    )
    .optional(),
  llmProviderId: z.int().optional(),
  systemPrompt: z.string().optional(),
  temperature: z.number().default(0.3),
  maxTokens: z.int().default(1024),
});

export const LlmRefineTranslationOutputSchema = z.object({
  refinedText: z.string(),
  refined: z.boolean(),
});

export type LlmRefineTranslationInput = z.infer<
  typeof LlmRefineTranslationInputSchema
>;
export type LlmRefineTranslationOutput = z.infer<
  typeof LlmRefineTranslationOutputSchema
>;

const buildRefinePrompt = (data: LlmRefineTranslationInput): string => {
  let prompt = `Source (${data.sourceLanguageId}): ${data.sourceText}\n`;
  prompt += `Candidate translation (${data.targetLanguageId}): ${data.candidateTranslation}\n`;

  if (data.terms.length > 0) {
    prompt += `\nGlossary (MUST use these terms):\n`;
    for (const t of data.terms) {
      prompt += `  "${t.term}" → "${t.translation}"`;
      if (t.definition) prompt += ` (${t.definition})`;
      prompt += `\n`;
    }
  }

  if (data.neighborTranslations && data.neighborTranslations.length > 0) {
    prompt += `\nNeighboring translations for context consistency:\n`;
    for (const n of data.neighborTranslations) {
      prompt += `  "${n.source}" → "${n.translation}"\n`;
    }
  }

  prompt += `\nRefine the candidate translation. Return ONLY the refined text.`;
  return prompt;
};

/**
 * @zh 使用 LLM 对翻译进行后校。
 *
 * 将候选翻译和术语表上下文发送给 LLM，要求其严格使用指定术语、
 * 保持语义并考虚邻近翻译一致性。若无可用 LLM_PROVIDER ，直接返回候选翻译原文。
 * @en Post-edit a translation using an LLM.
 *
 * Sends the candidate translation and glossary context to the LLM,
 * requiring it to use the given terms strictly, preserve the source meaning,
 * and maintain consistency with neighboring translations.
 * Returns the candidate unchanged when no LLM_PROVIDER is available.
 *
 * @param data - {@zh LLM 后校输入参数} {@en LLM post-editing input parameters}
 * @param ctx - {@zh 操作上下文} {@en Operation context}
 * @returns - {@zh 后校结果和是否实际执行了后校的标志} {@en Refined translation text and a flag indicating whether refinement was applied}
 */
export const llmRefineTranslationOp = async (
  data: LlmRefineTranslationInput,
  ctx?: OperationContext,
): Promise<LlmRefineTranslationOutput> => {
  const pluginManager = resolvePluginManager(ctx?.pluginManager);
  const llmService = firstOrGivenService(
    pluginManager,
    "LLM_PROVIDER",
    data.llmProviderId,
  );

  if (!llmService) {
    return { refinedText: data.candidateTranslation, refined: false };
  }

  const userPrompt = buildRefinePrompt(data);
  const response = await llmService.service.chat({
    messages: [
      {
        role: "system",
        content: data.systemPrompt ?? DEFAULT_REFINE_SYSTEM_PROMPT,
      },
      { role: "user", content: userPrompt },
    ],
    temperature: data.temperature,
    maxTokens: data.maxTokens,
    thinking: false,
  });

  const refinedText = (response.content ?? "").trim();
  return {
    refinedText:
      refinedText.length > 0 ? refinedText : data.candidateTranslation,
    refined: refinedText.length > 0,
  };
};
