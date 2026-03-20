import {
  deduplicateAndMatchOp,
  llmTermEnhanceOp,
  loadElementTextsOp,
  statisticalTermExtractOp,
} from "@cat/operations";
import * as z from "zod/v4";

import { defineGraphWorkflow } from "@/workflow/define-task";

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

/**
 * 术语冷启动（术语发现）工作流
 *
 * 步骤:
 * 1. 加载元素文本
 * 2a. NLP 批量分词（内嵌于 statisticalTermExtractOp）
 * 2b. POS 过滤 + N-gram + TF-IDF + C-value 打分
 * 3. 去重 & 与现有术语库比对
 * 4. LLM 增强（低置信度候选校验 + 定义/学科生成）
 * 5. 合并输出
 */
export const termDiscoveryWorkflow = defineGraphWorkflow({
  name: "term.discovery",
  input: TermDiscoveryInputSchema,
  output: TermDiscoveryResultSchema,
  steps: async () => [],
  handler: async (payload, ctx): Promise<TermDiscoveryResult> => {
    const config = payload.config;
    const statConfig = config?.statistical;
    const llmConfig = config?.llm;

    // Step 1: Load element texts
    const { elements } = await loadElementTextsOp(
      {
        documentIds: payload.documentIds,
        elementIds: payload.elementIds,
        sourceLanguageId: payload.sourceLanguageId,
      },
      ctx,
    );

    if (elements.length === 0) {
      return {
        candidates: [],
        stats: {
          totalElementsProcessed: 0,
          totalCandidatesFound: 0,
          statisticalCandidates: 0,
          llmCandidates: 0,
          existingTermsMatched: 0,
          nlpSegmenterUsed: "intl-fallback",
        },
      };
    }

    // Step 2: Statistical extraction (NLP segmentation + POS filter + TF-IDF + C-value)
    const statResult =
      statConfig?.enabled !== false
        ? await statisticalTermExtractOp(
            {
              texts: elements.map((e) => ({
                id: String(e.elementId),
                elementId: e.elementId,
                text: e.text,
              })),
              languageId: payload.sourceLanguageId,
              nlpSegmenterId: payload.nlpSegmenterId,
              config: {
                maxTermTokens: statConfig?.maxTermTokens ?? 5,
                minDocFreq: statConfig?.minDocFreq ?? 2,
                minTermLength: statConfig?.minTermLength ?? 2,
                tfIdfThreshold: statConfig?.tfIdfThreshold ?? 0.05,
                tfidfWeight: statConfig?.tfidfWeight ?? 0.6,
                cvalueWeight: statConfig?.cvalueWeight ?? 0.4,
              },
            },
            ctx,
          )
        : { candidates: [], nlpSegmenterUsed: "intl-fallback" as const };

    // Step 3: Deduplicate & match against existing glossary
    const { candidates: dedupedCandidates } = await deduplicateAndMatchOp(
      {
        candidates: statResult.candidates.map((c) => ({
          ...c,
          source: "statistical" as const,
        })),
        glossaryId: payload.glossaryId,
        sourceLanguageId: payload.sourceLanguageId,
      },
      ctx,
    );

    // Step 4: LLM enhancement (optional)
    const useRelaxedThreshold = statResult.nlpSegmenterUsed === "intl-fallback";

    const { candidates: enhancedCandidates, llmCandidatesAdded } =
      llmConfig?.enabled !== false
        ? await llmTermEnhanceOp(
            {
              candidates: dedupedCandidates,
              sourceLanguageId: payload.sourceLanguageId,
              config: {
                llmProviderId: llmConfig?.llmProviderId,
                confidenceThreshold: llmConfig?.confidenceThreshold ?? 0.3,
                batchSize: llmConfig?.batchSize ?? 20,
                inferDefinition: llmConfig?.inferDefinition ?? true,
                inferSubject: llmConfig?.inferSubject ?? true,
                useRelaxedThreshold,
              },
            },
            ctx,
          )
        : {
            candidates: dedupedCandidates.map((c) => ({
              ...c,
              definition: null,
              subjects: null,
            })),
            llmCandidatesAdded: 0,
          };

    // Step 5: Build final output
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
        totalElementsProcessed: elements.length,
        totalCandidatesFound: finalCandidates.length,
        statisticalCandidates: statResult.candidates.length,
        llmCandidates: llmCandidatesAdded,
        existingTermsMatched,
        nlpSegmenterUsed: statResult.nlpSegmenterUsed,
      },
    };
  },
});
