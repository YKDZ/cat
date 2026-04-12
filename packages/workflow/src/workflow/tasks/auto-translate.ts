import {
  collectMemoryRecallOp,
  fetchAdviseOp,
  llmRefineTranslationOp,
  termRecallOp,
} from "@cat/operations";
import { safeZDotJson } from "@cat/shared/schema/json";
import { MemorySuggestionSchema } from "@cat/shared/schema/misc";
import { TranslationAdviseSchema } from "@cat/shared/schema/plugin";
import * as z from "zod/v4";

import { defineNode, defineTypedGraph } from "@/graph/typed-dsl";
import { runGraph } from "@/graph/typed-dsl/run-graph";

import { createTranslationGraph } from "./create-translation";

// ─── Config Schema ────────────────────────────────────────────────────────────

export const AutoTranslateConfigSchema = z.object({
  llm: z
    .object({
      enabled: z.boolean().default(false),
      llmProviderId: z.int().optional(),
      systemPrompt: z.string().optional(),
      temperature: z.number().min(0).max(2).default(0.3),
      maxTokens: z.int().default(1024),
    })
    .optional(),
  gatherDocumentContext: z.boolean().default(false),
  weights: z
    .object({
      memory: z.number().min(0).default(1.0),
      advisor: z.number().min(0).default(0.8),
    })
    .optional(),
  /** confidence >= 此阈值时跳过 LLM 精修（仅 llm.enabled 时有意义） */
  highConfidenceThreshold: z.number().min(0).max(1).default(0.95),
});

export type AutoTranslateConfig = z.infer<typeof AutoTranslateConfigSchema>;

// ─── Input / Output Schemas ───────────────────────────────────────────────────

export const AutoTranslateInputSchema = z.object({
  translatableElementId: z.int(),
  text: z.string(),
  translationLanguageId: z.string(),
  sourceLanguageId: z.string(),
  translatorId: z.uuidv4().nullable(),
  advisorId: z.int().optional(),
  memoryIds: z.array(z.uuidv4()).default([]),
  glossaryIds: z.array(z.uuidv4()).default([]),
  chunkIds: z.array(z.int()).default([]),
  minMemorySimilarity: z.number().min(0).max(1),
  maxMemoryAmount: z.int().min(0).default(3),
  memoryVectorStorageId: z.int(),
  translationVectorStorageId: z.int(),
  vectorizerId: z.int(),
  documentId: z.uuidv4(),
  config: AutoTranslateConfigSchema.optional(),
});

export const AutoTranslateOutputSchema = z.object({
  translationIds: z.array(z.int()).optional(),
});

export type AutoTranslateInput = z.infer<typeof AutoTranslateInputSchema>;
export type AutoTranslateOutput = z.infer<typeof AutoTranslateOutputSchema>;

// ─── 中间节点 Schemas ─────────────────────────────────────────────────────────

const GatherContextOutputSchema = z.object({
  text: z.string(),
  sourceLanguageId: z.string(),
  translationLanguageId: z.string(),
  neighborTranslations: z.array(
    z.object({ source: z.string(), translation: z.string() }),
  ),
});

const TermContextItemSchema = z.object({
  term: z.string(),
  translation: z.string(),
  confidence: z.number(),
  definition: z.string().nullable(),
  concept: z.object({
    subjects: z.array(
      z.object({
        name: z.string(),
        defaultDefinition: z.string().nullable(),
      }),
    ),
    definition: z.string().nullable(),
  }),
});

// recall 节点：合并术语回归和记忆回归，在单节点内并发执行避免平行 patch 版本冲突
const RecallNodeInputSchema = z.object({
  text: z.string(),
  sourceLanguageId: z.string(),
  translationLanguageId: z.string(),
  glossaryIds: z.array(z.uuidv4()),
  chunkIds: z.array(z.int()),
  memoryIds: z.array(z.uuidv4()),
  minSimilarity: z.number().min(0).max(1),
  maxAmount: z.int().min(0),
  vectorStorageId: z.int(),
});

const RecallNodeOutputSchema = z.object({
  terms: z.array(TermContextItemSchema),
  memories: z.array(MemorySuggestionSchema),
});

const MtAdviseNodeInputSchema = z.object({
  text: z.string(),
  sourceLanguageId: z.string(),
  translationLanguageId: z.string(),
  advisorId: z.int().optional(),
  glossaryIds: z.array(z.uuidv4()),
  terms: z.array(TermContextItemSchema),
  memories: z.array(MemorySuggestionSchema),
});

const MtAdviseNodeOutputSchema = z.object({
  suggestions: z.array(TranslationAdviseSchema),
});

const AggregateNodeInputSchema = z.object({
  memories: z.array(MemorySuggestionSchema),
  suggestions: z.array(TranslationAdviseSchema),
  config: AutoTranslateConfigSchema.optional(),
});

const AggregateOutputSchema = z.object({
  candidates: z.array(
    z.object({
      text: z.string(),
      confidence: z.number(),
      source: z.enum(["memory", "advisor"]),
      meta: safeZDotJson,
    }),
  ),
  topCandidateText: z.string().nullable(),
  topCandidateMeta: safeZDotJson,
  skipLlmRefine: z.boolean(),
});

const LlmRefineNodeInputSchema = z.object({
  skipLlmRefine: z.boolean(),
  topCandidateText: z.string().nullable(),
  topCandidateMeta: safeZDotJson,
  terms: z.array(TermContextItemSchema),
  neighborTranslations: z.array(
    z.object({ source: z.string(), translation: z.string() }),
  ),
  text: z.string(),
  sourceLanguageId: z.string(),
  translationLanguageId: z.string(),
  config: AutoTranslateConfigSchema.optional(),
});

const LlmRefineNodeOutputSchema = z.object({
  selectedText: z.string(),
  refined: z.boolean(),
  meta: safeZDotJson,
});

const CreateTranslationNodeInputSchema = z.object({
  selectedText: z.string().nullable().optional(),
  fallbackText: z.string().nullable(),
  topCandidateMeta: safeZDotJson,
  translatableElementId: z.int(),
  translatorId: z.uuidv4().nullable(),
  translationLanguageId: z.string(),
  memoryIds: z.array(z.uuidv4()),
  vectorizerId: z.int(),
  translationVectorStorageId: z.int(),
  documentId: z.uuidv4(),
});

// ─── 6 节点线性流水线 ─────────────────────────────────────────────────────────────

export const autoTranslateGraph = defineTypedGraph({
  id: "auto-translate",
  version: "1.0.0",
  description: "自动翻译工作流 — 术语回归/记忆匹配/MT建议/LLM精修",

  input: AutoTranslateInputSchema,
  output: AutoTranslateOutputSchema,

  nodes: {
    "gather-context": defineNode({
      input: AutoTranslateInputSchema,
      output: GatherContextOutputSchema,
      handler: async (input, _ctx) => {
        // 后续可在 config.gatherDocumentContext === true 时查询邻近 element 已有翻译
        // 需要新增 domain query listNeighborTranslations
        return {
          text: input.text,
          sourceLanguageId: input.sourceLanguageId,
          translationLanguageId: input.translationLanguageId,
          neighborTranslations: [],
        };
      },
    }),

    // recall 节点：将术语回归和记忆回归合并为单节点并发执行，避免两个并行节点同时写黑板导致 CAS 冲突
    recall: defineNode({
      input: RecallNodeInputSchema,
      output: RecallNodeOutputSchema,
      inputMapping: {
        text: "gather-context.text",
        sourceLanguageId: "gather-context.sourceLanguageId",
        translationLanguageId: "gather-context.translationLanguageId",
        glossaryIds: "glossaryIds",
        chunkIds: "chunkIds",
        memoryIds: "memoryIds",
        minSimilarity: "minMemorySimilarity",
        maxAmount: "maxMemoryAmount",
        vectorStorageId: "memoryVectorStorageId",
      },
      handler: async (input, ctx) => {
        const [termResult, memoryResult] = await Promise.all([
          termRecallOp(
            {
              text: input.text,
              sourceLanguageId: input.sourceLanguageId,
              translationLanguageId: input.translationLanguageId,
              glossaryIds: input.glossaryIds,
              wordSimilarityThreshold: 0.3,
            },
            { traceId: ctx.runId, signal: ctx.signal },
          ),
          collectMemoryRecallOp(
            {
              text: input.text,
              chunkIds: input.chunkIds,
              memoryIds: input.memoryIds,
              sourceLanguageId: input.sourceLanguageId,
              translationLanguageId: input.translationLanguageId,
              minSimilarity: input.minSimilarity,
              maxAmount: input.maxAmount,
              vectorStorageId: input.vectorStorageId,
            },
            {
              traceId: ctx.runId,
              signal: ctx.signal,
              pluginManager: ctx.pluginManager,
            },
          ),
        ]);
        return { terms: termResult.terms, memories: memoryResult };
      },
    }),

    "mt-advise": defineNode({
      input: MtAdviseNodeInputSchema,
      output: MtAdviseNodeOutputSchema,
      inputMapping: {
        text: "gather-context.text",
        sourceLanguageId: "gather-context.sourceLanguageId",
        translationLanguageId: "gather-context.translationLanguageId",
        advisorId: "advisorId",
        glossaryIds: "glossaryIds",
        terms: "recall.terms",
        memories: "recall.memories",
      },
      handler: async (input, ctx) => {
        return fetchAdviseOp(
          {
            text: input.text,
            sourceLanguageId: input.sourceLanguageId,
            translationLanguageId: input.translationLanguageId,
            advisorId: input.advisorId,
            glossaryIds: input.glossaryIds,
            memoryIds: [],
            preloadedTerms: input.terms,
            preloadedMemories: input.memories.map((m) => ({
              source: m.source,
              translation: m.adaptedTranslation ?? m.translation,
              confidence: m.confidence,
            })),
          },
          {
            traceId: ctx.runId,
            signal: ctx.signal,
            pluginManager: ctx.pluginManager,
          },
        );
      },
    }),

    aggregate: defineNode({
      input: AggregateNodeInputSchema,
      output: AggregateOutputSchema,
      inputMapping: {
        memories: "recall.memories",
        suggestions: "mt-advise.suggestions",
        config: "config",
      },
      handler: async (input, _ctx) => {
        const memoryWeight = input.config?.weights?.memory ?? 1.0;
        const advisorWeight = input.config?.weights?.advisor ?? 0.8;
        const threshold = input.config?.highConfidenceThreshold ?? 0.95;
        const llmEnabled = input.config?.llm?.enabled ?? false;

        const candidates: {
          text: string;
          confidence: number;
          source: "memory" | "advisor";
          meta: Record<string, unknown>;
        }[] = [];

        for (const m of input.memories) {
          candidates.push({
            text: m.adaptedTranslation ?? m.translation,
            confidence: m.confidence * memoryWeight,
            source: "memory",
            meta: { memoryId: m.id, confidence: m.confidence },
          });
        }

        for (const s of input.suggestions) {
          candidates.push({
            text: s.translation,
            confidence: s.confidence * advisorWeight,
            source: "advisor",
            meta: s.meta ?? {},
          });
        }

        candidates.sort((a, b) => b.confidence - a.confidence);
        const top = candidates.at(0) ?? null;

        const skipLlmRefine =
          !llmEnabled || (top !== null && top.confidence >= threshold);

        return {
          candidates,
          topCandidateText: top?.text ?? null,
          topCandidateMeta: top?.meta ?? {},
          skipLlmRefine,
        };
      },
    }),

    // llm-refine 始终在流程中运行。当 skipLlmRefine=true 时直接透传 topCandidateText，
    // 避免使用条件边绕过该节点（条件边会导致 create-translation 的前序检查死锁）
    "llm-refine": defineNode({
      input: LlmRefineNodeInputSchema,
      output: LlmRefineNodeOutputSchema,
      inputMapping: {
        skipLlmRefine: "aggregate.skipLlmRefine",
        topCandidateText: "aggregate.topCandidateText",
        topCandidateMeta: "aggregate.topCandidateMeta",
        terms: "recall.terms",
        neighborTranslations: "gather-context.neighborTranslations",
        text: "gather-context.text",
        sourceLanguageId: "gather-context.sourceLanguageId",
        translationLanguageId: "gather-context.translationLanguageId",
        config: "config",
      },
      handler: async (input, ctx) => {
        if (input.skipLlmRefine || !input.topCandidateText) {
          return {
            selectedText: input.topCandidateText ?? "",
            refined: false,
            meta: input.topCandidateMeta ?? {},
          };
        }

        const { refinedText, refined } = await llmRefineTranslationOp(
          {
            sourceText: input.text,
            sourceLanguageId: input.sourceLanguageId,
            targetLanguageId: input.translationLanguageId,
            candidateTranslation: input.topCandidateText,
            terms: input.terms.map((t) => ({
              term: t.term,
              translation: t.translation,
              definition: t.definition,
            })),
            neighborTranslations: input.neighborTranslations,
            llmProviderId: input.config?.llm?.llmProviderId,
            systemPrompt: input.config?.llm?.systemPrompt,
            temperature: input.config?.llm?.temperature ?? 0.3,
            maxTokens: input.config?.llm?.maxTokens ?? 1024,
          },
          {
            traceId: ctx.runId,
            signal: ctx.signal,
            pluginManager: ctx.pluginManager,
          },
        );

        return {
          selectedText: refinedText,
          refined,
          meta: {
            ...(input.topCandidateMeta ?? {}),
            refined,
          },
        };
      },
    }),

    "create-translation": defineNode({
      input: CreateTranslationNodeInputSchema,
      output: AutoTranslateOutputSchema,
      inputMapping: {
        selectedText: "llm-refine.selectedText",
        fallbackText: "aggregate.topCandidateText",
        topCandidateMeta: "aggregate.topCandidateMeta",
        translatableElementId: "translatableElementId",
        translatorId: "translatorId",
        translationLanguageId: "translationLanguageId",
        memoryIds: "memoryIds",
        vectorizerId: "vectorizerId",
        translationVectorStorageId: "translationVectorStorageId",
        documentId: "documentId",
      },
      handler: async (input, ctx) => {
        const text = input.selectedText || input.fallbackText;
        if (!text) return {};

        const { translationIds } = await runGraph(
          createTranslationGraph,
          {
            data: [
              {
                translatableElementId: input.translatableElementId,
                languageId: input.translationLanguageId,
                text,
                meta: input.topCandidateMeta ?? {},
              },
            ],
            // 自动翻译暂时不创建记忆
            // memoryIds: input.memoryIds,
            vectorizerId: input.vectorizerId,
            vectorStorageId: input.translationVectorStorageId,
            translatorId: input.translatorId,
            documentId: input.documentId,
          },
          { signal: ctx.signal },
        );

        return { translationIds };
      },
    }),
  },

  // 线性流水线，避免并行节点写黑板导致 CAS 版本冲突
  edges: [
    { from: "gather-context", to: "recall" },
    { from: "recall", to: "mt-advise" },
    { from: "mt-advise", to: "aggregate" },
    { from: "aggregate", to: "llm-refine" },
    { from: "llm-refine", to: "create-translation" },
  ],

  entry: "gather-context",
  exit: ["create-translation"],
});
