import type { AgentToolDefinition } from "@cat/agent";

import { qaOp, tokenizeOp } from "@cat/operations";
import * as z from "zod";

const qaCheckArgs = z.object({
  /**
   * @zh 源文本
   * @en Source text
   */
  sourceText: z.string().describe("Original source text"),
  /**
   * @zh 源语言 ID（BCP-47）
   * @en Source language ID (BCP-47)
   */
  sourceLanguageId: z
    .string()
    .optional()
    .describe("Source language ID (BCP-47)"),
  /**
   * @zh 已翻译文本
   * @en Translated text to check
   */
  translatedText: z.string().describe("Translated text to QA-check"),
  /**
   * @zh 目标语言 ID（BCP-47）
   * @en Target language ID (BCP-47)
   */
  targetLanguageId: z
    .string()
    .optional()
    .describe("Target language ID (BCP-47)"),
  /**
   * @zh 术语表 UUID 列表（用于术语一致性检查）
   * @en Glossary UUIDs for terminology consistency check
   */
  glossaryIds: z
    .array(z.uuid())
    .default([])
    .describe("Glossary UUIDs for terminology check"),
});

/**
 * @zh qa_check 工具: 对翻译文本运行 QA 检查。
 * @en qa_check tool: run QA checks on the translated text.
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
