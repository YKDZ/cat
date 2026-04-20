import {
  deduplicateAndMatchOp,
  llmTermEnhanceOp,
  loadElementTextsOp,
  statisticalTermExtractOp,
} from "@cat/operations";
import * as z from "zod";

import { defineNode, defineGraph } from "@/graph/dsl";

// ─── Config Schema ───────────────────────────────────────────────────────────

export const TermDiscoveryConfigSchema = z.object({
  statistical: z
    .object({
      enabled: z.boolean().default(true),
      /** Maximum number of tokens in a candidate term (N-gram max N) */
      maxTermTokens: z.int().min(1).max(10).default(5),
      /** Minimum document frequency (must appear in at least N elements) */
      minDocFreq: z.int().min(1).default(2),
      /** Minimum character length of a candidate term */
      minTermLength: z.int().min(1).default(2),
      /** TF-IDF + C-value combined confidence threshold (0-1) */
      tfIdfThreshold: z.number().min(0).max(1).default(0.05),
      /** Weight for TF-IDF in combined score */
      tfidfWeight: z.number().min(0).max(1).default(0.6),
      /** Weight for C-value in combined score */
      cvalueWeight: z.number().min(0).max(1).default(0.4),
    })
    .optional(),

  llm: z
    .object({
      enabled: z.boolean().default(true),
      /** LLM provider service ID. Omit to use default. */
      llmProviderId: z.int().optional(),
      /** Confidence threshold below which candidates enter LLM validation */
      confidenceThreshold: z.number().min(0).max(1).default(0.3),
      /** Maximum candidates per LLM batch */
      batchSize: z.int().min(1).max(100).default(20),
      /** Whether to generate definition for validated candidates */
      inferDefinition: z.boolean().default(true),
      /** Whether to infer subject domain for validated candidates */
      inferSubject: z.boolean().default(true),
    })
    .optional(),
});

export const TermDiscoveryInputSchema = z.object({
  /** Document IDs — all elements within these documents are included */
  documentIds: z.array(z.uuidv4()).optional(),
  /** Or specify element IDs directly */
  elementIds: z.array(z.int()).optional(),
  /** Target glossary for dedup comparison */
  glossaryId: z.uuidv4(),
  /** Source language of the elements */
  sourceLanguageId: z.string().min(1),
  /** Optional NLP_WORD_SEGMENTER plugin service ID */
  nlpSegmenterId: z.int().optional(),
  config: TermDiscoveryConfigSchema.optional(),
});

export type TermDiscoveryInput = z.infer<typeof TermDiscoveryInputSchema>;
export type TermDiscoveryConfig = z.infer<typeof TermDiscoveryConfigSchema>;

// ─── Output Schema ───────────────────────────────────────────────────────────

export const TermDiscoveryCandidateSchema = z.object({
  /** Original surface form (most frequent in corpus) */
  text: z.string(),
  /** Lemma-normalized text (e.g. "run test" for "running tests") */
  normalizedText: z.string(),
  /** Combined confidence score 0-1 */
  confidence: z.number().min(0).max(1),
  /** Total occurrences across all elements */
  frequency: z.int(),
  /** Number of distinct elements containing this candidate */
  documentFrequency: z.int(),
  /** Which strategy produced this candidate */
  source: z.enum(["statistical", "llm", "both"]),
  /** POS pattern of the candidate (UPOS tags, null when from LLM-only) */
  posPattern: z.array(z.string()).nullable(),
  /** LLM-generated definition (genus-differentia style) */
  definition: z.string().nullable(),
  /** LLM-inferred subject domains */
  subjects: z.array(z.string()).nullable(),
  /** Whether the term already exists in the glossary */
  existsInGlossary: z.boolean(),
  /** Existing concept ID if in glossary */
  existingConceptId: z.int().nullable(),
  /** Sampled occurrence locations (max 10) */
  occurrences: z
    .array(
      z.object({
        elementId: z.int(),
        ranges: z.array(z.object({ start: z.int(), end: z.int() })),
      }),
    )
    .max(10),
});

export const TermDiscoveryResultSchema = z.object({
  candidates: z.array(TermDiscoveryCandidateSchema),
  stats: z.object({
    totalElementsProcessed: z.int(),
    totalCandidatesFound: z.int(),
    statisticalCandidates: z.int(),
    llmCandidates: z.int(),
    existingTermsMatched: z.int(),
    nlpSegmenterUsed: z.enum(["plugin", "intl-fallback"]),
  }),
});

export type TermDiscoveryCandidate = z.infer<
  typeof TermDiscoveryCandidateSchema
>;
export type TermDiscoveryResult = z.infer<typeof TermDiscoveryResultSchema>;

// ─── 中间节点 Schemas ────────────────────────────────────────────────────────

const LoadTextsOutputSchema = z.object({
  elements: z.array(
    z.object({
      elementId: z.int(),
      text: z.string(),
      languageId: z.string(),
    }),
  ),
});

const StatExtractInputSchema = z.object({
  elements: z.array(
    z.object({
      elementId: z.int(),
      text: z.string(),
      languageId: z.string(),
    }),
  ),
  languageId: z.string().min(1),
  nlpSegmenterId: z.int().optional(),
  config: TermDiscoveryConfigSchema.optional(),
});

const StatExtractOutputSchema = z.object({
  candidates: z.array(
    z.object({
      text: z.string(),
      normalizedText: z.string(),
      posPattern: z.array(z.string()),
      confidence: z.number().min(0).max(1),
      frequency: z.int(),
      documentFrequency: z.int(),
      occurrences: z.array(
        z.object({
          elementId: z.int(),
          ranges: z.array(z.object({ start: z.int(), end: z.int() })),
        }),
      ),
    }),
  ),
  nlpSegmenterUsed: z.enum(["plugin", "intl-fallback"]),
});

const DedupMatchInputSchema = z.object({
  candidates: z.array(
    z.object({
      text: z.string(),
      normalizedText: z.string(),
      posPattern: z.array(z.string()),
      confidence: z.number().min(0).max(1),
      frequency: z.int(),
      documentFrequency: z.int(),
      occurrences: z.array(
        z.object({
          elementId: z.int(),
          ranges: z.array(z.object({ start: z.int(), end: z.int() })),
        }),
      ),
    }),
  ),
  glossaryId: z.uuid(),
  sourceLanguageId: z.string().min(1),
});

const DedupMatchOutputSchema = z.object({
  candidates: z.array(
    z.object({
      text: z.string(),
      normalizedText: z.string(),
      posPattern: z.array(z.string()),
      confidence: z.number().min(0).max(1),
      frequency: z.int(),
      documentFrequency: z.int(),
      source: z.enum(["statistical", "llm", "both"]),
      existsInGlossary: z.boolean(),
      existingConceptId: z.int().nullable(),
      occurrences: z.array(
        z.object({
          elementId: z.int(),
          ranges: z.array(z.object({ start: z.int(), end: z.int() })),
        }),
      ),
    }),
  ),
});

const LlmEnhanceInputSchema = z.object({
  dedupCandidates: z.array(
    z.object({
      text: z.string(),
      normalizedText: z.string(),
      posPattern: z.array(z.string()),
      confidence: z.number().min(0).max(1),
      frequency: z.int(),
      documentFrequency: z.int(),
      source: z.enum(["statistical", "llm", "both"]),
      existsInGlossary: z.boolean(),
      existingConceptId: z.int().nullable(),
      occurrences: z.array(
        z.object({
          elementId: z.int(),
          ranges: z.array(z.object({ start: z.int(), end: z.int() })),
        }),
      ),
    }),
  ),
  sourceLanguageId: z.string().min(1),
  config: TermDiscoveryConfigSchema.optional(),
  statNlpUsed: z.enum(["plugin", "intl-fallback"]),
  elements: z.array(
    z.object({ elementId: z.int(), text: z.string(), languageId: z.string() }),
  ),
  statCandidates: z.array(z.unknown()),
});

// ─── 类型安全 DAG 声明 ──────────────────────────────────────────────────────

/**
 * 术语冷启动（术语发现）工作流
 *
 * DAG 结构：load-texts → stat-extract → dedup-match → llm-enhance
 */
export const termDiscoveryGraph = defineGraph({
  id: "term-discovery",
  version: "1.0.0",
  description: "术语发现工作流 — 从文档元素中提取候选术语",

  input: TermDiscoveryInputSchema,
  output: TermDiscoveryResultSchema,

  nodes: {
    "load-texts": defineNode({
      input: TermDiscoveryInputSchema,
      output: LoadTextsOutputSchema,
      handler: async (input, ctx) => {
        const opCtx = { traceId: ctx.runId, signal: ctx.signal };
        const { elements } = await loadElementTextsOp(
          {
            documentIds: input.documentIds,
            elementIds: input.elementIds,
            sourceLanguageId: input.sourceLanguageId,
          },
          opCtx,
        );
        return { elements };
      },
    }),

    "stat-extract": defineNode({
      input: StatExtractInputSchema,
      output: StatExtractOutputSchema,
      inputMapping: {
        elements: "load-texts.elements",
        languageId: "sourceLanguageId",
        nlpSegmenterId: "nlpSegmenterId",
        config: "config",
      },
      handler: async (input, ctx) => {
        const opCtx = { traceId: ctx.runId, signal: ctx.signal };
        const statConfig = input.config?.statistical;

        if (input.elements.length === 0 || statConfig?.enabled === false) {
          return { candidates: [], nlpSegmenterUsed: "intl-fallback" as const };
        }

        return statisticalTermExtractOp(
          {
            texts: input.elements.map((e) => ({
              id: String(e.elementId),
              elementId: e.elementId,
              text: e.text,
            })),
            languageId: input.languageId,
            nlpSegmenterId: input.nlpSegmenterId,
            config: {
              maxTermTokens: statConfig?.maxTermTokens ?? 5,
              minDocFreq: statConfig?.minDocFreq ?? 2,
              minTermLength: statConfig?.minTermLength ?? 2,
              tfIdfThreshold: statConfig?.tfIdfThreshold ?? 0.05,
              tfidfWeight: statConfig?.tfidfWeight ?? 0.6,
              cvalueWeight: statConfig?.cvalueWeight ?? 0.4,
            },
          },
          opCtx,
        );
      },
    }),

    "dedup-match": defineNode({
      input: DedupMatchInputSchema,
      output: DedupMatchOutputSchema,
      inputMapping: {
        candidates: "stat-extract.candidates",
        glossaryId: "glossaryId",
        sourceLanguageId: "sourceLanguageId",
      },
      handler: async (input, ctx) => {
        const opCtx = { traceId: ctx.runId, signal: ctx.signal };

        if (input.candidates.length === 0) {
          return { candidates: [] };
        }

        return deduplicateAndMatchOp(
          {
            candidates: input.candidates.map((c) => ({
              ...c,
              source: "statistical" as const,
            })),
            glossaryId: input.glossaryId,
            sourceLanguageId: input.sourceLanguageId,
          },
          opCtx,
        );
      },
    }),

    "llm-enhance": defineNode({
      input: LlmEnhanceInputSchema,
      output: TermDiscoveryResultSchema,
      inputMapping: {
        dedupCandidates: "dedup-match.candidates",
        sourceLanguageId: "sourceLanguageId",
        config: "config",
        statNlpUsed: "stat-extract.nlpSegmenterUsed",
        elements: "load-texts.elements",
        statCandidates: "stat-extract.candidates",
      },
      outputMapping: {
        candidates: "candidates",
        stats: "stats",
      },
      handler: async (input, ctx) => {
        const opCtx = { traceId: ctx.runId, signal: ctx.signal };
        const llmConfig = input.config?.llm;
        const useRelaxedThreshold = input.statNlpUsed === "intl-fallback";

        const { candidates: enhancedCandidates, llmCandidatesAdded } =
          llmConfig?.enabled !== false
            ? await llmTermEnhanceOp(
                {
                  candidates: input.dedupCandidates,
                  sourceLanguageId: input.sourceLanguageId,
                  config: {
                    llmProviderId: llmConfig?.llmProviderId,
                    confidenceThreshold: llmConfig?.confidenceThreshold ?? 0.3,
                    batchSize: llmConfig?.batchSize ?? 20,
                    inferDefinition: llmConfig?.inferDefinition ?? true,
                    inferSubject: llmConfig?.inferSubject ?? true,
                    useRelaxedThreshold,
                  },
                },
                opCtx,
              )
            : {
                candidates: input.dedupCandidates.map((c) => ({
                  ...c,
                  definition: null,
                  subjects: null,
                })),
                llmCandidatesAdded: 0,
              };

        const existingTermsMatched = enhancedCandidates.filter(
          (c) => c.existsInGlossary,
        ).length;

        const finalCandidates = enhancedCandidates.map((c) => ({
          text: c.text,
          normalizedText: c.normalizedText,
          confidence: c.confidence,
          frequency: c.frequency,
          documentFrequency: c.documentFrequency,
          source: c.source,
          posPattern: c.posPattern.length > 0 ? c.posPattern : null,
          definition: c.definition ?? null,
          subjects: c.subjects ?? null,
          existsInGlossary: c.existsInGlossary,
          existingConceptId: c.existingConceptId,
          occurrences: c.occurrences.slice(0, 10),
        }));

        return {
          candidates: finalCandidates,
          stats: {
            totalElementsProcessed: input.elements.length,
            totalCandidatesFound: finalCandidates.length,
            statisticalCandidates: input.statCandidates.length,
            llmCandidates: llmCandidatesAdded,
            existingTermsMatched,
            nlpSegmenterUsed: input.statNlpUsed,
          },
        };
      },
    }),
  },

  edges: [
    { from: "load-texts", to: "stat-extract" },
    { from: "stat-extract", to: "dedup-match" },
    { from: "dedup-match", to: "llm-enhance" },
  ],

  entry: "load-texts",
  exit: ["llm-enhance"],

  config: {
    maxConcurrentNodes: 1,
    defaultTimeoutMs: 120_000,
    enableCheckpoints: true,
    checkpointIntervalMs: 1000,
  },
});

/** 向后兼容：保留 termDiscoveryWorkflow 名称 */
export const termDiscoveryWorkflow = termDiscoveryGraph;
