import {
  llmTermAlignOp,
  mergeAlignmentOp,
  statisticalTermAlignOp,
  vectorTermAlignOp,
} from "@cat/operations";
import * as z from "zod/v4";

import { defineGraphWorkflow } from "@/workflow/define-task";

// ─── Input Schema ────────────────────────────────────────────────────────────

const AlignmentCandidateSchema = z.object({
  text: z.string(),
  normalizedText: z.string().optional(),
  confidence: z.number().min(0).max(1).optional(),
  posPattern: z.array(z.string()).nullable().optional(),
  definition: z.string().nullable().optional(),
  subjects: z.array(z.string()).nullable().optional(),
  /** Occurrence locations (used for statistical co-occurrence alignment) */
  occurrences: z
    .array(
      z.object({
        elementId: z.int(),
        /** Translation ID — present when the occurrence is in a translated string */
        translationId: z.int().optional(),
        ranges: z.array(z.object({ start: z.int(), end: z.int() })),
      }),
    )
    .optional(),
});

export const TermAlignmentInputSchema = z.object({
  /** At least 2 groups of candidates in different languages */
  termGroups: z
    .array(
      z.object({
        languageId: z.string().min(1),
        candidates: z.array(AlignmentCandidateSchema),
      }),
    )
    .min(2),
  /** Optional glossary to include existing terms in alignment */
  glossaryId: z.uuidv4().optional(),
  /** Optional NLP_WORD_SEGMENTER plugin service ID */
  nlpSegmenterId: z.int().optional(),

  config: z
    .object({
      vector: z
        .object({
          enabled: z.boolean().default(true),
          /** TEXT_VECTORIZER plugin service ID */
          vectorizerId: z.int().optional(),
          /** VECTOR_STORAGE plugin service ID */
          vectorStorageId: z.int().optional(),
          /** Minimum cosine similarity for a match */
          minSimilarity: z.number().min(0).max(1).default(0.75),
        })
        .optional(),
      statistical: z
        .object({
          enabled: z.boolean().default(true),
          /** Minimum co-occurrence ratio to consider a pair aligned */
          minCoOccurrence: z.number().min(0).max(1).default(0.3),
        })
        .optional(),
      llm: z
        .object({
          enabled: z.boolean().default(true),
          /** LLM provider service ID. Omit to use default. */
          llmProviderId: z.int().optional(),
          /** Maximum pairs per LLM batch */
          batchSize: z.int().min(1).max(50).default(30),
        })
        .optional(),
      /** Strategy weights for final fusion */
      weights: z
        .object({
          vector: z.number().min(0).default(0.5),
          statistical: z.number().min(0).default(0.3),
          llm: z.number().min(0).default(0.2),
        })
        .optional(),
    })
    .optional(),
});

export type TermAlignmentInput = z.infer<typeof TermAlignmentInputSchema>;
export type AlignmentCandidate = z.infer<typeof AlignmentCandidateSchema>;

// ─── Output Schema ───────────────────────────────────────────────────────────

export const AlignedTermSchema = z.object({
  languageId: z.string(),
  text: z.string(),
  normalizedText: z.string().optional(),
  definition: z.string().nullable().optional(),
  subjects: z.array(z.string()).nullable().optional(),
  /** String ID if a TranslatableString was created for this term during vectorization */
  stringId: z.int().nullable().optional(),
});

export const AlignedGroupSchema = z.object({
  /** All terms in this aligned group (one per language) */
  terms: z.array(AlignedTermSchema),
  /** Combined alignment confidence 0-1 */
  confidence: z.number().min(0).max(1),
  /** Which strategies contributed to this alignment */
  alignmentSources: z.array(z.enum(["vector", "statistical", "llm"])),
});

export const TermAlignmentResultSchema = z.object({
  alignedGroups: z.array(AlignedGroupSchema),
  /** Candidates that could not be aligned to any group */
  unaligned: z.array(
    z.object({
      text: z.string(),
      languageId: z.string(),
      reason: z.string(),
    }),
  ),
  stats: z.object({
    totalInputTerms: z.int(),
    totalAlignedGroups: z.int(),
    vectorAlignments: z.int(),
    statisticalAlignments: z.int(),
    llmAlignments: z.int(),
  }),
});

export type AlignedGroup = z.infer<typeof AlignedGroupSchema>;
export type AlignedTerm = z.infer<typeof AlignedTermSchema>;
export type TermAlignmentResult = z.infer<typeof TermAlignmentResultSchema>;

/**
 * 术语对齐工作流
 *
 * 将多个语言组中的候选术语按概念进行跨语言对齐，步骤：
 * 1. 向量余弦相似度对齐（TEXT_VECTORIZER + VECTOR_STORAGE，Decision #4-C）
 * 2. 统计共现对齐（基于翻译对的 translationId 级共现，Decision #5-B）
 * 3. LLM 兜底对齐（对向量和统计未覆盖的候选对，Decision #6-A）
 * 4. 加权融合 + Union-Find 传递闭包，生成最终多语言术语组
 */
export const termAlignmentWorkflow = defineGraphWorkflow({
  name: "term.alignment",
  input: TermAlignmentInputSchema,
  output: TermAlignmentResultSchema,
  steps: async () => [],
  handler: async (payload, ctx): Promise<TermAlignmentResult> => {
    const config = payload.config;
    const vectorCfg = config?.vector;
    const statCfg = config?.statistical;
    const llmCfg = config?.llm;

    // Normalize termGroups to a minimal shared shape
    const termGroups = payload.termGroups.map((g) => ({
      languageId: g.languageId,
      candidates: g.candidates.map((c) => ({
        text: c.text,
        normalizedText: c.normalizedText,
        confidence: c.confidence,
        posPattern: c.posPattern,
        definition: c.definition,
        subjects: c.subjects,
        occurrences: c.occurrences?.map((o) => ({
          elementId: o.elementId,
          translationId: o.translationId,
          ranges: o.ranges,
        })),
      })),
    }));

    // ── Step 1: Vector alignment ──────────────────────────────────────────────

    const vectorResult =
      vectorCfg?.enabled !== false &&
      vectorCfg?.vectorizerId !== undefined &&
      vectorCfg?.vectorStorageId !== undefined
        ? await vectorTermAlignOp(
            {
              termGroups: termGroups.map((g) => ({
                languageId: g.languageId,
                candidates: g.candidates.map((c) => ({
                  text: c.text,
                  normalizedText: c.normalizedText,
                  definition: c.definition,
                })),
              })),
              config: {
                vectorizerId: vectorCfg.vectorizerId,
                vectorStorageId: vectorCfg.vectorStorageId,
                minSimilarity: vectorCfg.minSimilarity ?? 0.75,
              },
            },
            ctx,
          )
        : { alignedPairs: [], stringIds: [] };

    // ── Step 2: Statistical alignment ─────────────────────────────────────────

    const statResult =
      statCfg?.enabled !== false
        ? await statisticalTermAlignOp(
            {
              termGroups: termGroups.map((g) => ({
                languageId: g.languageId,
                candidates: g.candidates.map((c) => ({
                  text: c.text,
                  normalizedText: c.normalizedText,
                  occurrences: c.occurrences,
                })),
              })),
              config: {
                minCoOccurrence: statCfg?.minCoOccurrence ?? 0.3,
              },
              nlpSegmenterId: payload.nlpSegmenterId,
            },
            ctx,
          )
        : { alignedPairs: [] };

    // ── Step 3: LLM alignment (fallback for unresolved pairs) ─────────────────

    const llmResult =
      llmCfg?.enabled !== false
        ? await (async () => {
            // Build set of already-aligned canonical pair keys
            const alignedSet = new Set<string>();
            const canonKey = (
              gA: number,
              cA: number,
              gB: number,
              cB: number,
            ) => {
              if (gA < gB || (gA === gB && cA <= cB))
                return `${gA}:${cA}|${gB}:${cB}`;
              return `${gB}:${cB}|${gA}:${cA}`;
            };

            for (const p of vectorResult.alignedPairs) {
              alignedSet.add(
                canonKey(
                  p.groupAIndex,
                  p.candidateAIndex,
                  p.groupBIndex,
                  p.candidateBIndex,
                ),
              );
            }
            for (const p of statResult.alignedPairs) {
              alignedSet.add(
                canonKey(
                  p.groupAIndex,
                  p.candidateAIndex,
                  p.groupBIndex,
                  p.candidateBIndex,
                ),
              );
            }

            // Generate unaligned cross-group pairs (limited to avoid LLM cost explosion)
            const maxLlmPairs = (llmCfg?.batchSize ?? 30) * 5;
            const unalignedPairs: Array<{
              groupAIndex: number;
              candidateAIndex: number;
              groupBIndex: number;
              candidateBIndex: number;
            }> = [];

            outer: for (let gA = 0; gA < termGroups.length; gA += 1) {
              for (let gB = gA + 1; gB < termGroups.length; gB += 1) {
                const candA = termGroups[gA].candidates;
                const candB = termGroups[gB].candidates;
                for (let cA = 0; cA < candA.length; cA += 1) {
                  for (let cB = 0; cB < candB.length; cB += 1) {
                    const key = canonKey(gA, cA, gB, cB);
                    if (!alignedSet.has(key)) {
                      unalignedPairs.push({
                        groupAIndex: gA,
                        candidateAIndex: cA,
                        groupBIndex: gB,
                        candidateBIndex: cB,
                      });
                      if (unalignedPairs.length >= maxLlmPairs) break outer;
                    }
                  }
                }
              }
            }

            if (unalignedPairs.length === 0) return { alignedPairs: [] };

            return await llmTermAlignOp(
              {
                termGroups: termGroups.map((g) => ({
                  languageId: g.languageId,
                  candidates: g.candidates.map((c) => ({
                    text: c.text,
                    posPattern: c.posPattern,
                    definition: c.definition,
                  })),
                })),
                unalignedGroupPairs: unalignedPairs,
                config: {
                  llmProviderId: llmCfg?.llmProviderId,
                  batchSize: llmCfg?.batchSize ?? 30,
                },
              },
              ctx,
            );
          })()
        : { alignedPairs: [] };

    // ── Step 4: Weighted fusion + transitive closure ─────────────────────────

    const mergeResult = mergeAlignmentOp({
      termGroups,
      vectorPairs: vectorResult.alignedPairs,
      statisticalPairs: statResult.alignedPairs,
      llmPairs: llmResult.alignedPairs,
      stringIds: vectorResult.stringIds,
      config: {
        weights: config?.weights
          ? {
              vector: config.weights.vector ?? 0.5,
              statistical: config.weights.statistical ?? 0.3,
              llm: config.weights.llm ?? 0.2,
            }
          : undefined,
        minFusedScore: 0.4,
      },
    });

    return mergeResult;
  },
});
