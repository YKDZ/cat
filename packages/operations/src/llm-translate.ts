import type { OperationContext } from "@cat/domain";
import type { FlattenedContextEvidence } from "@cat/shared";

import {
  assembleContextEvidence,
  executeQuery,
  getDbHandle,
  getElementMeta,
  listElementComments,
  listElementSourceTexts,
} from "@cat/domain";
import {
  collectLLMResponse,
  firstOrGivenService,
  resolvePluginManager,
  serverLogger as logger,
} from "@cat/server-shared";
import { TranslationAdviseSchema } from "@cat/shared";
import * as z from "zod";

// ─── Config schema ─────────────────────────────────────────────────────────────

export const LlmTranslateConfigSchema = z.object({
  memory: z.boolean().default(true),
  term: z.boolean().default(true),
  elementMeta: z.boolean().default(true),
  neighborTranslations: z.boolean().default(true),
  elementContexts: z
    .object({
      enabled: z.boolean().default(true),
      includeTypes: z
        .array(z.enum(["TEXT", "JSON", "FILE", "MARKDOWN", "URL", "IMAGE"]))
        .optional(),
    })
    .default({ enabled: true }),
  approvedTranslations: z
    .object({
      enabled: z.boolean().default(true),
      maxCount: z.int().min(0).default(5),
    })
    .default({ enabled: true, maxCount: 5 }),
  comments: z
    .object({
      enabled: z.boolean().default(false),
      maxCount: z.int().min(0).default(5),
    })
    .default({ enabled: false, maxCount: 5 }),
});

export type LlmTranslateConfig = z.infer<typeof LlmTranslateConfigSchema>;

export const SessionTranslationSchema = z.object({
  elementId: z.int(),
  source: z.string(),
  translation: z.string(),
  preservedAsIs: z.boolean().default(false),
});

export type SessionTranslation = z.infer<typeof SessionTranslationSchema>;

// ─── Input schema ──────────────────────────────────────────────────────────────

export const LlmTranslateInputSchema = z.object({
  elementId: z.int(),
  targetLanguageId: z.string(),

  config: LlmTranslateConfigSchema,

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

  terms: z
    .array(
      z.object({
        term: z.string(),
        translation: z.string(),
        definition: z.string().nullable(),
      }),
    )
    .default([]),

  sessionTranslations: z.array(SessionTranslationSchema).default([]),

  llmProviderId: z.int().optional(),
  temperature: z.number().default(0.3),
  maxTokens: z.int().default(1024),
});

export type LlmTranslateInput = z.input<typeof LlmTranslateInputSchema>;

// ─── Output schema ─────────────────────────────────────────────────────────────

const LlmTranslateSignalClassSchema = z.enum([
  "memory",
  "term",
  "neighborTranslations",
  "source",
  "elementMeta",
  "elementContexts",
  "approvedTranslations",
  "comments",
]);

type LlmTranslateSignalClass = z.infer<typeof LlmTranslateSignalClassSchema>;

export const LlmTranslateOutputSchema = z.object({
  suggestion: TranslationAdviseSchema.extend({
    meta: z
      .object({
        source: z.literal("llm-translate"),
        signalClasses: z.array(LlmTranslateSignalClassSchema),
      })
      .optional(),
  }).nullable(),
});

export type LlmTranslateOutput = z.infer<typeof LlmTranslateOutputSchema>;

// ─── Confidence derivation ─────────────────────────────────────────────────────

type ConfidenceContext = {
  memories: LlmTranslateInput["memories"];
  terms: LlmTranslateInput["terms"];
  sessionTranslationsCount: number;
  neighborTranslationsCount: number;
  elementContextsCount: number;
  approvedTranslationsCount: number;
  elementMeta: boolean;
  commentsCount: number;
};

/**
 * @zh 计算 LLM 翻译建议的置信度评分。
 *
 * 基础分由记忆匹配的置信度决定，然后为每种存在的上下文信号添加固定增量。
 * 硬上限为 0.85，四舍五入到小数点后四位。
 * @en Derive a confidence score for an LLM translation suggestion.
 *
 * Base score from memory match confidence, plus fixed bonuses per context signal present.
 * Hard cap at 0.85, rounded to 4 decimal places.
 *
 * @param ctx - {@zh 置信度上下文信号} {@en Confidence context signals}
 * @returns - {@zh 0-0.85 的置信度评分} {@en Confidence score between 0 and 0.85}
 */
export const deriveLlmTranslateConfidence = (
  ctx: ConfidenceContext,
): number => {
  const mems = ctx.memories ?? [];
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

  if ((ctx.terms ?? []).length > 0) base = Math.min(base + 0.03, 0.85);
  if (ctx.sessionTranslationsCount > 0) base = Math.min(base + 0.02, 0.85);
  if (ctx.neighborTranslationsCount > 0) base = Math.min(base + 0.02, 0.85);
  if (ctx.elementContextsCount > 0) base = Math.min(base + 0.01, 0.85);
  if (ctx.approvedTranslationsCount > 0) base = Math.min(base + 0.01, 0.85);
  if (ctx.elementMeta) base = Math.min(base + 0.01, 0.85);
  if (ctx.commentsCount > 0) base = Math.min(base + 0.01, 0.85);

  return parseFloat(base.toFixed(4));
};

// ─── Prompt builder ────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a professional translator.
Rules:
1. Output ONLY the translation text — no explanations, quotes, or additional markup.
2. You MUST use any provided glossary terms exactly as given.
3. If a memory match is provided, treat it as a strong reference and adapt it to the current source text.
4. Maintain consistency with neighboring translations when provided.`;

type ResolvedContext = {
  sourceText: string;
  sourceLanguageId: string;
  targetLanguageId: string;
  config: z.infer<typeof LlmTranslateConfigSchema>;
  memories: z.infer<typeof LlmTranslateInputSchema>["memories"];
  terms: z.infer<typeof LlmTranslateInputSchema>["terms"];
  sessionTranslations: Array<{
    elementId: number;
    source: string;
    translation: string;
    preservedAsIs: boolean;
  }>;
  elementMeta: Record<string, unknown> | null;
  neighborTranslations: Array<{ source: string; translation: string }>;
  evidence: FlattenedContextEvidence[];
  approvedTranslations: Array<{
    source: string;
    translation: string;
    elementId: number;
  }>;
  comments: Array<{
    id: number;
    authorId: string;
    content: string;
    createdAt: Date;
    children: Array<{
      id: number;
      authorId: string;
      content: string;
      createdAt: Date;
    }>;
  }>;
};

const formatEvidenceForPrompt = (item: FlattenedContextEvidence): string => {
  const payload = item.payload;
  const text =
    typeof payload === "object" && payload !== null && "text" in payload
      ? Reflect.get(payload, "text")
      : null;
  const body = typeof text === "string" ? text : JSON.stringify(payload);
  return `[${item.label}; trust=${item.trustLevel}; score=${item.score}] ${body}`;
};

const buildUserPrompt = (resolved: ResolvedContext): string => {
  let prompt = `Translate from ${resolved.sourceLanguageId} to ${resolved.targetLanguageId}.\n\n`;
  prompt += `Source text:\n${resolved.sourceText}\n`;

  // Memory reference
  if (resolved.config.memory) {
    const topMemory = resolved.memories[0];
    if (topMemory) {
      const memoryTranslation =
        topMemory.adaptedTranslation ?? topMemory.translation;
      prompt += `\nTranslation memory reference (adapt to the current source text):\n`;
      prompt += `  Source:      ${topMemory.source}\n`;
      prompt += `  Translation: ${memoryTranslation}\n`;
    }
  }

  // Glossary terms
  if (resolved.config.term && resolved.terms.length > 0) {
    prompt += `\nGlossary (MUST use these terms exactly):\n`;
    for (const t of resolved.terms) {
      prompt += `  "${t.term}" → "${t.translation}"`;
      if (t.definition) prompt += ` (${t.definition})`;
      prompt += `\n`;
    }
  }

  // Element metadata
  if (
    resolved.config.elementMeta &&
    resolved.elementMeta &&
    Object.keys(resolved.elementMeta).length > 0
  ) {
    prompt += `\nElement metadata:\n`;
    for (const [key, value] of Object.entries(resolved.elementMeta)) {
      prompt += `  ${key}: ${String(value)}\n`;
    }
  }

  // Neighbor translations
  if (
    resolved.config.neighborTranslations &&
    resolved.neighborTranslations.length > 0
  ) {
    prompt += `\nNeighboring translations (for consistency):\n`;
    for (const n of resolved.neighborTranslations) {
      prompt += `  "${n.source}" → "${n.translation}"\n`;
    }
  }

  // Session translations (unsaved in-session translations for consistency)
  if (resolved.sessionTranslations && resolved.sessionTranslations.length > 0) {
    prompt += `\nPreviously translated in this editing session:\n`;
    for (const s of resolved.sessionTranslations) {
      prompt += `  "${s.source}" → "${s.translation}"`;
      if (s.preservedAsIs) prompt += ` (preserved as-is)`;
      prompt += `\n`;
    }
  }

  // Context evidence
  if (resolved.config.elementContexts.enabled && resolved.evidence.length > 0) {
    prompt += `\nContext evidence:\n`;
    for (const item of resolved.evidence) {
      prompt += `  - ${formatEvidenceForPrompt(item)}\n`;
    }
  }

  // Comments
  if (resolved.config.comments.enabled && resolved.comments.length > 0) {
    prompt += `\nComments on this element:\n`;
    for (const comment of resolved.comments) {
      prompt += `  [${comment.authorId} at ${comment.createdAt.toISOString()}]: ${comment.content}\n`;
      for (const child of comment.children) {
        prompt += `    [${child.authorId} at ${child.createdAt.toISOString()}]: ${child.content}\n`;
      }
    }
  }

  prompt += `\nOutput only the translation:`;
  return prompt;
};

/** @internal test-only export */
export const buildUserPromptForTest = buildUserPrompt;

// ─── Data Loader ───────────────────────────────────────────────────────────────

const WINDOW_SIZE = 3;

const loadContext = async (
  input: z.infer<typeof LlmTranslateInputSchema>,
): Promise<ResolvedContext> => {
  const db = await getDbHandle();
  const dbCtx = { db: db.client };

  const safeQuery = async <T>(
    label: string,
    fn: () => Promise<T>,
  ): Promise<T | null> => {
    try {
      return await fn();
    } catch (err: unknown) {
      logger
        .withSituation("OP")
        .warn(
          { err, elementId: input.elementId },
          `llmTranslateOp: ${label} failed, omitting`,
        );
      return null;
    }
  };

  const [sourceTexts, metaResult, commentsResults, evidenceResults] =
    await Promise.all([
      executeQuery(dbCtx, listElementSourceTexts, {
        elementIds: [input.elementId],
      }),

      input.config.elementMeta
        ? safeQuery("getElementMeta", async () =>
            executeQuery(dbCtx, getElementMeta, {
              elementId: input.elementId,
            }),
          )
        : Promise.resolve(null),

      input.config.comments.enabled
        ? safeQuery("listElementComments", async () =>
            executeQuery(dbCtx, listElementComments, {
              elementId: input.elementId,
              maxCount: input.config.comments.maxCount,
            }),
          )
        : Promise.resolve(null),

      input.config.elementContexts.enabled
        ? safeQuery("assembleContextEvidence", async () =>
            executeQuery(dbCtx, assembleContextEvidence, {
              elementId: input.elementId,
              purpose: "AI",
              maxItems:
                input.config.approvedTranslations.maxCount + WINDOW_SIZE + 4,
            }),
          )
        : Promise.resolve(null),
    ]);

  const sourceRow = sourceTexts[0];
  if (!sourceRow) {
    throw new Error(`Element ${input.elementId} not found`);
  }

  return {
    sourceText: sourceRow.text,
    sourceLanguageId: sourceRow.sourceLanguageId,
    targetLanguageId: input.targetLanguageId,
    config: input.config,
    memories: input.memories,
    terms: input.terms,
    sessionTranslations: input.sessionTranslations ?? [],
    // oxlint-disable-next-line typescript-eslint/no-unsafe-type-assertion
    elementMeta: (metaResult as Record<string, unknown>) ?? null,
    neighborTranslations: [],
    evidence: evidenceResults ?? [],
    approvedTranslations: [],
    comments: commentsResults ?? [],
  };
};

// ─── Operation ─────────────────────────────────────────────────────────────────

/**
 * @zh LLM 翻译建议（内置首方建议源）。
 *
 * 自行加载元素信息、邻居翻译、元素上下文、元素元数据、已批准翻译和评论，
 * 结合调用方传入的记忆召回和术语召回结果，调用一次 LLM 生成翻译建议。
 *
 * 在以下情况返回 `{ suggestion: null }`：
 * - LLM_PROVIDER 不可用
 * - LLM 调用失败
 * - 元素未找到
 * - 数据库访问失败
 * @en Built-in LLM Translation Suggestion (first-party suggestion source).
 *
 * Self-loads element info, neighbor translations, element contexts, element metadata,
 * approved translations, and comments via domain queries. Combines with
 * caller-provided memory recall and term recall results, then calls the LLM
 * once to produce a translation suggestion.
 *
 * Returns `{ suggestion: null }` when:
 * - No LLM_PROVIDER is available
 * - The LLM call fails
 * - The element is not found
 * - Database access fails
 *
 * @param data - {@zh LLM 翻译输入参数} {@en LLM translate input}
 * @param ctx  - {@zh 操作上下文} {@en Operation context}
 */
export const llmTranslateOp = async (
  data: LlmTranslateInput,
  ctx?: OperationContext,
): Promise<LlmTranslateOutput> => {
  const input = LlmTranslateInputSchema.parse(data);
  const pluginManager = resolvePluginManager(ctx?.pluginManager);
  const llmService = firstOrGivenService(
    pluginManager,
    "LLM_PROVIDER",
    input.llmProviderId,
  );

  if (!llmService) {
    return { suggestion: null };
  }

  // Self-load context via domain queries (resilient: individual failures are caught)
  let resolved: ResolvedContext;
  try {
    resolved = await loadContext(input);
  } catch (err: unknown) {
    logger
      .withSituation("OP")
      .error(
        { err, elementId: input.elementId },
        "llmTranslateOp: data loading failed, returning null",
      );
    return { suggestion: null };
  }

  // Effective arrays — config gates whether the signal is active for both prompt and confidence
  const effectiveMemories = input.config.memory ? resolved.memories : [];
  const effectiveTerms = input.config.term ? resolved.terms : [];

  // Build signal classes metadata
  const signalClasses: LlmTranslateSignalClass[] = ["source"];
  if (effectiveMemories.length > 0) signalClasses.push("memory");
  if (effectiveTerms.length > 0) signalClasses.push("term");
  if (resolved.neighborTranslations.length > 0)
    signalClasses.push("neighborTranslations");
  if (resolved.elementMeta && Object.keys(resolved.elementMeta).length > 0)
    signalClasses.push("elementMeta");
  if (resolved.evidence.length > 0) signalClasses.push("elementContexts");
  if (resolved.approvedTranslations.length > 0)
    signalClasses.push("approvedTranslations");
  if (resolved.comments.length > 0) signalClasses.push("comments");

  const confidence = deriveLlmTranslateConfidence({
    memories: effectiveMemories,
    terms: effectiveTerms,
    sessionTranslationsCount: resolved.sessionTranslations.length,
    neighborTranslationsCount: resolved.neighborTranslations.length,
    elementContextsCount: resolved.evidence.length,
    approvedTranslationsCount: resolved.approvedTranslations.length,
    elementMeta:
      resolved.elementMeta !== null &&
      Object.keys(resolved.elementMeta).length > 0,
    commentsCount: resolved.comments.length,
  });

  try {
    const response = await collectLLMResponse(
      llmService.service.chat({
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: buildUserPrompt(resolved) },
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
          source: "llm-translate" as const,
          signalClasses,
        },
      },
    };
  } catch (err: unknown) {
    logger
      .withSituation("OP")
      .warn(
        { err, elementId: input.elementId },
        "llmTranslateOp: LLM call failed",
      );
    return { suggestion: null };
  }
};
