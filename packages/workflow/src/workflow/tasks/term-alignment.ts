import {
  llmTermAlignOp,
  mergeAlignmentOp,
  statisticalTermAlignOp,
  vectorTermAlignOp,
} from "@cat/operations";
import * as z from "zod/v4";

import { defineNode, defineTypedGraph } from "@/graph/typed-dsl";

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

// ─── 中间节点 Schemas ────────────────────────────────────────────────────────

/** start 节点：规范化 termGroups 并写入 BB */
const StartOutputSchema = z.object({
  termGroups: z.array(
    z.object({
      languageId: z.string().min(1),
      candidates: z.array(
        z.object({
          text: z.string(),
          normalizedText: z.string().optional(),
          confidence: z.number().optional(),
          posPattern: z.array(z.string()).nullable().optional(),
          definition: z.string().nullable().optional(),
          subjects: z.array(z.string()).nullable().optional(),
          occurrences: z
            .array(
              z.object({
                elementId: z.int(),
                translationId: z.int().optional(),
                ranges: z.array(z.object({ start: z.int(), end: z.int() })),
              }),
            )
            .optional(),
        }),
      ),
    }),
  ),
});

const AlignedPairSchema = z.object({
  groupAIndex: z.int(),
  candidateAIndex: z.int(),
  groupBIndex: z.int(),
  candidateBIndex: z.int(),
});

const VectorAlignOutputSchema = z.object({
  alignedPairs: z.array(
    AlignedPairSchema.extend({ similarity: z.number().min(0).max(1) }),
  ),
  stringIds: z.array(
    z.object({
      groupIndex: z.int(),
      candidateIndex: z.int(),
      stringId: z.int(),
    }),
  ),
});

const StatAlignOutputSchema = z.object({
  alignedPairs: z.array(
    AlignedPairSchema.extend({ coOccurrenceScore: z.number().min(0).max(1) }),
  ),
});

const LlmAlignInputSchema = z.object({
  termGroups: StartOutputSchema.shape.termGroups,
  vectorPairs: VectorAlignOutputSchema.shape.alignedPairs,
  statPairs: StatAlignOutputSchema.shape.alignedPairs,
  config: TermAlignmentInputSchema.shape.config,
});

const LlmAlignOutputSchema = z.object({
  alignedPairs: z.array(
    AlignedPairSchema.extend({ llmScore: z.number().min(0).max(1) }),
  ),
});

const MergeInputSchema = z.object({
  termGroups: StartOutputSchema.shape.termGroups,
  vectorPairs: VectorAlignOutputSchema.shape.alignedPairs,
  statPairs: StatAlignOutputSchema.shape.alignedPairs,
  llmPairs: LlmAlignOutputSchema.shape.alignedPairs,
  stringIds: VectorAlignOutputSchema.shape.stringIds,
  config: TermAlignmentInputSchema.shape.config,
});

// ─── 类型安全 DAG 声明 ──────────────────────────────────────────────────────

/**
 * 术语对齐工作流
 *
 * DAG 结构（含并行分支）：
 *         ┌─ vector-align ─┐
 * start ──┤                 ├── llm-align ── merge
 *         └─ stat-align  ──┘
 */
export const termAlignmentGraph = defineTypedGraph({
  id: "term-alignment",
  version: "1.0.0",
  description: "术语对齐工作流 — 跨语言术语配对",

  input: TermAlignmentInputSchema,
  output: TermAlignmentResultSchema,

  nodes: {
    start: defineNode({
      input: TermAlignmentInputSchema,
      output: StartOutputSchema,
      handler: async (input, _ctx) => {
        // 规范化 termGroups
        const termGroups = input.termGroups.map((g) => ({
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
        return { termGroups };
      },
    }),

    "vector-align": defineNode({
      input: z.object({
        termGroups: StartOutputSchema.shape.termGroups,
        config: TermAlignmentInputSchema.shape.config,
      }),
      output: VectorAlignOutputSchema,
      inputMapping: {
        termGroups: "start.termGroups",
        config: "config",
      },
      handler: async (input, ctx) => {
        const opCtx = { traceId: ctx.runId, signal: ctx.signal };
        const vectorCfg = input.config?.vector;

        if (
          vectorCfg?.enabled === false ||
          vectorCfg?.vectorizerId === undefined ||
          vectorCfg?.vectorStorageId === undefined
        ) {
          return { alignedPairs: [], stringIds: [] };
        }

        return vectorTermAlignOp(
          {
            termGroups: input.termGroups.map((g) => ({
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
          opCtx,
        );
      },
    }),

    "stat-align": defineNode({
      input: z.object({
        termGroups: StartOutputSchema.shape.termGroups,
        config: TermAlignmentInputSchema.shape.config,
        nlpSegmenterId: TermAlignmentInputSchema.shape.nlpSegmenterId,
      }),
      output: StatAlignOutputSchema,
      inputMapping: {
        termGroups: "start.termGroups",
        config: "config",
        nlpSegmenterId: "nlpSegmenterId",
      },
      handler: async (input, ctx) => {
        const opCtx = { traceId: ctx.runId, signal: ctx.signal };
        const statCfg = input.config?.statistical;

        if (statCfg?.enabled === false) {
          return { alignedPairs: [] };
        }

        return statisticalTermAlignOp(
          {
            termGroups: input.termGroups.map((g) => ({
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
            nlpSegmenterId: input.nlpSegmenterId,
          },
          opCtx,
        );
      },
    }),

    "llm-align": defineNode({
      input: LlmAlignInputSchema,
      output: LlmAlignOutputSchema,
      inputMapping: {
        termGroups: "start.termGroups",
        vectorPairs: "vector-align.alignedPairs",
        statPairs: "stat-align.alignedPairs",
        config: "config",
      },
      handler: async (input, ctx) => {
        const opCtx = { traceId: ctx.runId, signal: ctx.signal };
        const llmCfg = input.config?.llm;

        if (llmCfg?.enabled === false) {
          return { alignedPairs: [] };
        }

        // Build set of already-aligned canonical pair keys
        const alignedSet = new Set<string>();
        const canonKey = (gA: number, cA: number, gB: number, cB: number) => {
          if (gA < gB || (gA === gB && cA <= cB))
            return `${gA}:${cA}|${gB}:${cB}`;
          return `${gB}:${cB}|${gA}:${cA}`;
        };

        for (const p of input.vectorPairs) {
          alignedSet.add(
            canonKey(
              p.groupAIndex,
              p.candidateAIndex,
              p.groupBIndex,
              p.candidateBIndex,
            ),
          );
        }
        for (const p of input.statPairs) {
          alignedSet.add(
            canonKey(
              p.groupAIndex,
              p.candidateAIndex,
              p.groupBIndex,
              p.candidateBIndex,
            ),
          );
        }

        const maxLlmPairs = (llmCfg?.batchSize ?? 30) * 5;
        const unalignedPairs: Array<{
          groupAIndex: number;
          candidateAIndex: number;
          groupBIndex: number;
          candidateBIndex: number;
        }> = [];

        outer: for (let gA = 0; gA < input.termGroups.length; gA += 1) {
          for (let gB = gA + 1; gB < input.termGroups.length; gB += 1) {
            const candA = input.termGroups[gA]?.candidates ?? [];
            const candB = input.termGroups[gB]?.candidates ?? [];
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

        return llmTermAlignOp(
          {
            termGroups: input.termGroups.map((g) => ({
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
          opCtx,
        );
      },
    }),

    merge: defineNode({
      input: MergeInputSchema,
      output: TermAlignmentResultSchema,
      inputMapping: {
        termGroups: "start.termGroups",
        vectorPairs: "vector-align.alignedPairs",
        statPairs: "stat-align.alignedPairs",
        llmPairs: "llm-align.alignedPairs",
        stringIds: "vector-align.stringIds",
        config: "config",
      },
      outputMapping: {
        alignedGroups: "alignedGroups",
        unaligned: "unaligned",
        stats: "stats",
      },
      handler: async (input, _ctx) => {
        return mergeAlignmentOp({
          termGroups: input.termGroups,
          vectorPairs: input.vectorPairs,
          statisticalPairs: input.statPairs,
          llmPairs: input.llmPairs,
          stringIds: input.stringIds,
          config: {
            weights: input.config?.weights
              ? {
                  vector: input.config.weights.vector ?? 0.5,
                  statistical: input.config.weights.statistical ?? 0.3,
                  llm: input.config.weights.llm ?? 0.2,
                }
              : undefined,
            minFusedScore: 0.4,
          },
        });
      },
    }),
  },

  edges: [
    { from: "start", to: "vector-align" },
    { from: "start", to: "stat-align" },
    { from: "vector-align", to: "llm-align" },
    { from: "stat-align", to: "llm-align" },
    { from: "llm-align", to: "merge" },
  ],

  entry: "start",
  exit: ["merge"],

  config: {
    maxConcurrentNodes: 2,
    defaultTimeoutMs: 120_000,
    enableCheckpoints: true,
    checkpointIntervalMs: 1000,
  },
});

/** 向后兼容：保留 termAlignmentWorkflow 名称 */
export const termAlignmentWorkflow = termAlignmentGraph;
