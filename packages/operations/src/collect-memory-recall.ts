import type { DbHandle, OperationContext } from "@cat/domain";
import {
  executeQuery,
  getDbHandle,
  listExactMemorySuggestions,
  listKeywordMemorySuggestions,
  listScopedMemoryRecallDerivationStates,
  listTemplateMemorySuggestions,
  listTrgmMemorySuggestions,
  listVariantMemorySuggestions,
} from "@cat/domain";
import {
  selectFirstServiceImplementation,
  resolvePluginManager,
  serverLogger as logger,
} from "@cat/server-shared";
import type {
  CandidateChannel,
  CandidateChannelBlocker,
  CandidateChannelOutcome,
  LanguageAnalysisToken,
  RecallDerivationVersion,
  SlotMappingEntry,
} from "@cat/shared";
import {
  CandidateChannelRequestSchema,
  CandidateChannelValues,
  NormalizedLanguageIdSchema,
  MemoryRecallCandidateSchema,
  MemoryRecallResultSchema,
  type MemorySuggestion,
  ServiceImplementationReferenceSchema,
  type MemoryRecallCandidate,
  type MemoryRecallResult,
} from "@cat/shared";
import * as z from "zod";

import {
  assertRecallOperationAvailable,
  createSucceededCandidateChannelOutcome,
  getCandidateRecallCandidates,
} from "./candidate-recall.ts";
import {
  applyMemoryHnfPre,
  applyMemoryHnfPost,
} from "./hard-negative-filter/index.ts";
import {
  joinLemmas,
  normalizeTokenLemma,
} from "./language-analysis-normalization.ts";
import { LanguageAnalysisRequirementError } from "./language-analysis-requirement.ts";
import { probeMemoryRecallDependency } from "./memory-recall-derivation.ts";
import {
  fillTemplate,
  mappingToSlots,
  placeholderize,
} from "./memory-template.ts";
import { runPrecisionPipeline } from "./precision/precision-pipeline.ts";
import { augmentWithSparseLane } from "./precision/sparse-lane.ts";
import type {
  MemorySuggestionWithPrecision,
  RawMemoryResult,
  RecallCandidate,
} from "./precision/types.ts";
import { RecallDerivationAdapterError } from "./recall-derivation-adapter.ts";
import { assessScopedRecallDerivation } from "./recall-derivation-channel.ts";
import { searchMemoryOp } from "./search-memory.ts";
import { applySelfExclusion } from "./self-exclusion-filter.ts";
import { matchTemplateStructure } from "./template-structure-matcher.ts";
import { tokenizeOp } from "./tokenize.ts";

export {
  MemoryRecallCandidateSchema,
  MemoryRecallResultSchema,
  type MemoryRecallCandidate,
  type MemoryRecallResult,
};

export const CollectMemoryRecallInputBaseSchema = z.strictObject({
  text: z.string(),
  sourceLanguageId: NormalizedLanguageIdSchema,
  translationLanguageId: NormalizedLanguageIdSchema,
  memoryIds: z.array(z.uuid()),
  memoryScope: z.enum(["PROJECT", "PERSONAL"]).default("PROJECT"),
  minSimilarity: z.number().min(0).max(1).default(0.72),
  minVariantSimilarity: z.number().min(0).max(1).default(0.7),
  maxAmount: z.int().min(1).default(5),
  vectorStorage: ServiceImplementationReferenceSchema.optional(),
  /** Memory item UUIDs to exclude from results (self-exclusion). */
  excludeMemoryItemIds: z.array(z.string()).optional(),
  rerankMode: z.enum(["baseline", "reranked"]).default("reranked"),
  rerankProvider: ServiceImplementationReferenceSchema.optional(),
  rerankTimeoutMs: z.int().positive().default(3000),
  channels: CandidateChannelRequestSchema.default([...CandidateChannelValues]),
});

export const CollectMemoryRecallInputSchema =
  CollectMemoryRecallInputBaseSchema;

export type CollectMemoryRecallInput = z.input<
  typeof CollectMemoryRecallInputSchema
>;

/**
 * Aggregated memory recall with multi-channel evidence merge.
 *
 * Channels (in order of speed):
 * 1. Exact match (fastest)
 * 2. trgm similarity
 * 3. Variant-based (morphological / template / fragment)
 *
 * All results are globally deduplicated by `memoryItem.id`, keeping the
 * highest confidence across all channels. Evidence from multiple channels
 * is merged onto the winning result.
 */
export const collectMemoryRecallOp = async (
  data: CollectMemoryRecallInput,
  ctx?: OperationContext,
): Promise<MemoryRecallResult> => {
  const input = CollectMemoryRecallInputSchema.parse(data);
  const requestedChannels = new Set(input.channels);
  const channelBlockers = new Map<CandidateChannel, CandidateChannelBlocker>();
  const channelSkips = new Map<
    CandidateChannel,
    "NO_SCOPED_ASSETS" | "NOT_APPLICABLE"
  >();

  const setExecutionBlocker = (
    channel: CandidateChannel,
    error: unknown,
    capability: CandidateChannelBlocker["capability"] = "DATABASE",
  ) => {
    channelBlockers.set(channel, {
      reason: "CHANNEL_EXECUTION_FAILED",
      message: error instanceof Error ? error.message : String(error),
      retryable: true,
      capability,
    });
  };

  const emptyResult = (): MemoryRecallResult => {
    const outcome = (
      channel: CandidateChannel,
    ): CandidateChannelOutcome<MemorySuggestionWithPrecision> =>
      requestedChannels.has(channel)
        ? { status: "SKIPPED", reason: "NO_SCOPED_ASSETS" }
        : { status: "SKIPPED", reason: "NOT_REQUESTED" };
    return MemoryRecallResultSchema.parse({
      requestedChannels: input.channels,
      outcomes: {
        EXACT: outcome("EXACT"),
        FUZZY: outcome("FUZZY"),
        KEYWORD: outcome("KEYWORD"),
        VARIANT: outcome("VARIANT"),
        SEMANTIC: outcome("SEMANTIC"),
      },
    });
  };
  if (input.memoryIds.length === 0) return emptyResult();

  const { client: drizzle } = await getDbHandle();
  const pluginManager = resolvePluginManager(ctx?.pluginManager);

  const text = input.text;
  let sourceLanguageAnalysisTokens: LanguageAnalysisToken[] | undefined;
  let recallDependency:
    | Awaited<ReturnType<typeof probeMemoryRecallDependency>>
    | undefined;

  const languageAnalysisBlocker = (error: unknown): CandidateChannelBlocker =>
    error instanceof LanguageAnalysisRequirementError ||
    (error instanceof RecallDerivationAdapterError &&
      error.blockers.some((blocker) => blocker.reason === "LANGUAGE_ANALYSIS"))
      ? {
          reason: "LANGUAGE_ANALYSIS_UNAVAILABLE",
          message: error.message,
          retryable:
            error instanceof LanguageAnalysisRequirementError
              ? (error.assessment.blocker?.retryable ?? false)
              : error.blockers.every((blocker) => blocker.retryable),
          capability: "LANGUAGE_ANALYSIS",
        }
      : {
          reason: "CHANNEL_EXECUTION_FAILED",
          message: error instanceof Error ? error.message : String(error),
          retryable: true,
          capability: "LANGUAGE_ANALYSIS",
        };

  if (requestedChannels.has("KEYWORD") || requestedChannels.has("VARIANT")) {
    try {
      recallDependency = await probeMemoryRecallDependency({
        db: drizzle,
        pluginManager,
        languageId: input.sourceLanguageId,
        text,
        timeoutMs: 5_000,
        ctx,
      });
      if (!recallDependency.tokens) {
        throw new TypeError(
          "Current Language Analysis did not return tokens for recall.",
        );
      }
      sourceLanguageAnalysisTokens = recallDependency.tokens;
    } catch (error) {
      const blocker = languageAnalysisBlocker(error);
      if (requestedChannels.has("KEYWORD")) {
        channelBlockers.set("KEYWORD", blocker);
      }
      if (requestedChannels.has("VARIANT")) {
        channelBlockers.set("VARIANT", blocker);
      }
    }
  }

  const commonInput = {
    text,
    sourceLanguageId: input.sourceLanguageId,
    translationLanguageId: input.translationLanguageId,
    memoryIds: input.memoryIds,
    maxAmount: input.maxAmount,
  };

  let currentSourceTemplatePromise:
    | Promise<{
        template: string;
        slots: ReturnType<typeof placeholderize>["slots"];
      }>
    | undefined;

  const getCurrentSourceTemplate = async () => {
    if (!currentSourceTemplatePromise) {
      currentSourceTemplatePromise = tokenizeOp({ text }, ctx).then(
        ({ tokens }) => {
          const result = placeholderize(tokens, text);
          return { template: result.template, slots: result.slots };
        },
      );
    }
    return currentSourceTemplatePromise;
  };

  const tryAdapt = async (
    suggestion: MemorySuggestion,
    sourceTemplate: string | null,
    translationTemplate: string | null,
    slotMapping: SlotMappingEntry[] | null,
  ): Promise<MemorySuggestion> => {
    if (!sourceTemplate || !translationTemplate || !slotMapping) {
      return suggestion;
    }

    const currentSourceTemplate = await getCurrentSourceTemplate();
    if (currentSourceTemplate.template !== sourceTemplate) {
      return suggestion;
    }

    const storedTranslationSlots = mappingToSlots(
      slotMapping
        .filter((s) => s.placeholder.startsWith("tgt:"))
        .map((s) => ({ ...s, placeholder: s.placeholder.slice(4) })),
    );

    const adapted = fillTemplate(
      translationTemplate,
      storedTranslationSlots,
      currentSourceTemplate.slots,
    );

    if (adapted !== null) {
      return {
        ...suggestion,
        adaptedTranslation: adapted,
        adaptationMethod: "token-replaced" as const,
      };
    }

    return suggestion;
  };

  const evidenceKey = (evidence: MemorySuggestion["evidences"][number]) =>
    [
      evidence.channel,
      evidence.matchedText ?? "",
      evidence.matchedVariantText ?? "",
      evidence.matchedVariantType ?? "",
      evidence.note ?? "",
    ].join("\0");

  const mergeSuggestions = (
    existing: MemorySuggestion | undefined,
    candidate: MemorySuggestion,
  ): MemorySuggestion => {
    if (!existing) {
      return {
        ...candidate,
        evidences: [...candidate.evidences],
      };
    }

    const base =
      candidate.confidence > existing.confidence
        ? { ...candidate, evidences: [...candidate.evidences] }
        : { ...existing, evidences: [...existing.evidences] };
    const extra =
      candidate.confidence > existing.confidence ? existing : candidate;
    const seenEvidence = new Set(base.evidences.map(evidenceKey));

    for (const evidence of extra.evidences) {
      const key = evidenceKey(evidence);
      if (seenEvidence.has(key)) continue;
      seenEvidence.add(key);
      base.evidences.push(evidence);
    }

    base.confidence = Math.max(existing.confidence, candidate.confidence);
    base.matchedText = base.matchedText ?? extra.matchedText;
    base.matchedVariantText =
      base.matchedVariantText ?? extra.matchedVariantText;
    base.matchedVariantType =
      base.matchedVariantType ?? extra.matchedVariantType;
    base.adaptedTranslation =
      base.adaptedTranslation ?? extra.adaptedTranslation;
    base.adaptationMethod = base.adaptationMethod ?? extra.adaptationMethod;
    return base;
  };

  const staged = new Map<CandidateChannel, Map<number, MemorySuggestion>>(
    CandidateChannelValues.map((channel) => [channel, new Map()]),
  );

  // Deduplicate committed candidates by memory item across product channels.
  const seen = new Map<number, MemorySuggestion>();

  const pushResult = async (
    channel: CandidateChannel,
    id: number,
    raw: {
      source: string;
      translation: string;
      translationChunkSetId: number | null;
      memoryId: string;
      creatorId: string | null;
      confidence: number;
      createdAt: Date;
      updatedAt: Date;
      sourceTemplate?: string | null | undefined;
      translationTemplate?: string | null | undefined;
      translationId?: number | null | undefined;
      slotMapping?: SlotMappingEntry[] | null | undefined;
      matchedVariantText?: string | undefined;
      matchedVariantType?: string | undefined;
      matchedText?: string | undefined;
      evidences?: MemorySuggestion["evidences"] | undefined;
    },
  ) => {
    const suggestion: MemorySuggestion = {
      id,
      source: raw.source,
      translation: raw.translation,
      translationChunkSetId: raw.translationChunkSetId,
      sourceScope: input.memoryScope,
      ...(raw.translationId === undefined
        ? {}
        : { translationId: raw.translationId }),
      ...(raw.sourceTemplate === undefined
        ? {}
        : { sourceTemplate: raw.sourceTemplate }),
      ...(raw.translationTemplate === undefined
        ? {}
        : { translationTemplate: raw.translationTemplate }),
      memoryId: raw.memoryId,
      creatorId: raw.creatorId,
      confidence: raw.confidence,
      createdAt: raw.createdAt,
      updatedAt: raw.updatedAt,
      ...(raw.matchedText === undefined
        ? {}
        : { matchedText: raw.matchedText }),
      ...(raw.matchedVariantText === undefined
        ? {}
        : { matchedVariantText: raw.matchedVariantText }),
      ...(raw.matchedVariantType === undefined
        ? {}
        : { matchedVariantType: raw.matchedVariantType }),
      evidences: raw.evidences ? [...raw.evidences] : [],
    };

    const adapted = await tryAdapt(
      suggestion,
      raw.sourceTemplate ?? null,
      raw.translationTemplate ?? null,
      raw.slotMapping ?? null,
    );

    const channelCandidates = staged.get(channel);
    if (!channelCandidates) {
      throw new TypeError(`Missing Candidate Channel stage for ${channel}.`);
    }
    channelCandidates.set(
      id,
      mergeSuggestions(channelCandidates.get(id), adapted),
    );
  };

  // Channel 1: Exact match
  if (requestedChannels.has("EXACT"))
    try {
      const exactResults = await executeQuery(
        { db: drizzle },
        listExactMemorySuggestions,
        commonInput,
      );
      await Promise.all(
        exactResults.map(async (r) => pushResult("EXACT", r.id, r)),
      );
    } catch (err) {
      setExecutionBlocker("EXACT", err);
    }

  // Channel 2: trgm similarity
  if (requestedChannels.has("FUZZY"))
    try {
      const trgmResults = await executeQuery(
        { db: drizzle },
        listTrgmMemorySuggestions,
        { ...commonInput, minSimilarity: input.minSimilarity },
      );
      await Promise.all(
        trgmResults.map(async (r) => pushResult("FUZZY", r.id, r)),
      );
    } catch (err) {
      setExecutionBlocker("FUZZY", err);
    }

  const collectDerivationChannels = async (
    derivationDb: DbHandle,
    requiredDerivationVersion: RecallDerivationVersion,
    normalizedText: string,
  ) => {
    // The query template is a required input to every variant lookup. Compute
    // it once so a tokenizer failure cannot degrade into a silent empty match.
    if (requestedChannels.has("VARIANT"))
      try {
        const currentSourceTemplate = await getCurrentSourceTemplate();
        const variantResults = await executeQuery(
          { db: derivationDb },
          listVariantMemorySuggestions,
          {
            text,
            normalizedText,
            sourceLanguageId: input.sourceLanguageId,
            translationLanguageId: input.translationLanguageId,
            memoryIds: input.memoryIds,
            minSimilarity: input.minVariantSimilarity,
            maxAmount: input.maxAmount,
            requiredDerivationVersion,
          },
        );
        await Promise.all(
          variantResults.map(async (r) => {
            if (r.matchedVariantType === "TOKEN_TEMPLATE" && r.sourceTemplate) {
              const match = await matchTemplateStructure(
                text,
                r.sourceTemplate,
                currentSourceTemplate,
              );

              if (match) {
                // Template equality is conclusive for this candidate.
                return pushResult("VARIANT", r.id, {
                  ...r,
                  confidence: 1.0,
                  evidences: [
                    {
                      channel: "template" as const,
                      matchedText: r.source,
                      matchedVariantText: r.matchedVariantText,
                      matchedVariantType: "TOKEN_TEMPLATE",
                      confidence: 1.0,
                      note: "template structure equality match",
                    },
                    ...r.evidences.filter((e) => e.channel !== "template"),
                  ],
                });
              }
              // Keep the original variant result when the templates differ.
            }
            return pushResult("VARIANT", r.id, r);
          }),
        );
        // Template equality bypasses pg_trgm similarity for placeholder-only
        // changes, but shares the same query template as structural matching.
        if (currentSourceTemplate.template) {
          const templateResults = await executeQuery(
            { db: derivationDb },
            listTemplateMemorySuggestions,
            {
              sourceTemplate: currentSourceTemplate.template,
              sourceLanguageId: input.sourceLanguageId,
              translationLanguageId: input.translationLanguageId,
              memoryIds: input.memoryIds,
              maxAmount: input.maxAmount,
              requiredDerivationVersion,
            },
          );
          if (templateResults.length > 0) {
            await Promise.all(
              templateResults.map(async (r) =>
                pushResult("VARIANT", r.id, {
                  ...r,
                  confidence: 1.0,
                  matchedVariantType: "TOKEN_TEMPLATE",
                  matchedText: r.source,
                  evidences: [
                    {
                      channel: "template" as const,
                      matchedText: r.source,
                      matchedVariantType: "TOKEN_TEMPLATE" as const,
                      confidence: 1.0,
                      note: "template structure equality match",
                    },
                  ],
                }),
              ),
            );
          }
        }
      } catch (err) {
        setExecutionBlocker("VARIANT", err, "RECALL_DERIVATION");
      }

    // Channel 5: analyzer-backed keyword overlap on fresh Recall Variants.
    const keywords = sourceLanguageAnalysisTokens
      ? [
          ...new Set(
            sourceLanguageAnalysisTokens
              .filter((token) => !token.isStop && !token.isPunct)
              .map((token) =>
                joinLemmas([token], input.sourceLanguageId).trim(),
              )
              .filter((keyword) => keyword.length > 0),
          ),
        ]
      : [];
    if (requestedChannels.has("KEYWORD") && keywords.length > 0) {
      try {
        const keywordResults = await executeQuery(
          { db: derivationDb },
          listKeywordMemorySuggestions,
          {
            keywords,
            sourceLanguageId: input.sourceLanguageId,
            translationLanguageId: input.translationLanguageId,
            requiredDerivationVersion,
            memoryIds: input.memoryIds,
            maxAmount: input.maxAmount,
          },
        );
        await Promise.all(
          keywordResults.map(async (r) => pushResult("KEYWORD", r.id, r)),
        );
      } catch (err) {
        setExecutionBlocker("KEYWORD", err);
      }
    }
  };

  if (
    (requestedChannels.has("KEYWORD") || requestedChannels.has("VARIANT")) &&
    recallDependency !== undefined
  ) {
    try {
      const normalizedText =
        sourceLanguageAnalysisTokens !== undefined &&
        sourceLanguageAnalysisTokens.length > 0
          ? joinLemmas(
              sourceLanguageAnalysisTokens.filter(
                (token) => !token.isStop && !token.isPunct,
              ),
              input.sourceLanguageId,
            )
          : text.toLowerCase();

      await drizzle.transaction(
        async (tx) => {
          const scopedStates = await executeQuery(
            { db: tx },
            listScopedMemoryRecallDerivationStates,
            {
              memoryIds: input.memoryIds,
              sourceLanguageId: input.sourceLanguageId,
              translationLanguageId: input.translationLanguageId,
            },
          );
          const assessment = assessScopedRecallDerivation(
            scopedStates,
            "MEMORY_ITEM",
            recallDependency.requiredDerivationVersion,
          );
          if (assessment.status === "BLOCKED") {
            if (requestedChannels.has("KEYWORD")) {
              channelBlockers.set("KEYWORD", assessment.blocker);
            }
            if (requestedChannels.has("VARIANT")) {
              channelBlockers.set("VARIANT", assessment.blocker);
            }
            return;
          }
          if (assessment.status === "NO_SCOPED_ASSETS") {
            if (requestedChannels.has("KEYWORD")) {
              channelSkips.set("KEYWORD", "NO_SCOPED_ASSETS");
            }
            if (requestedChannels.has("VARIANT")) {
              channelSkips.set("VARIANT", "NO_SCOPED_ASSETS");
            }
            return;
          }
          if (assessment.status === "FRESH") {
            await collectDerivationChannels(
              tx,
              recallDependency.requiredDerivationVersion,
              normalizedText,
            );
          }
        },
        { isolationLevel: "repeatable read", accessMode: "read only" },
      );
    } catch (error) {
      const blocker: CandidateChannelBlocker =
        error instanceof LanguageAnalysisRequirementError
          ? {
              reason: "LANGUAGE_ANALYSIS_UNAVAILABLE",
              message: error.message,
              retryable: error.assessment.blocker?.retryable ?? false,
              capability: "LANGUAGE_ANALYSIS",
            }
          : {
              reason: "CHANNEL_EXECUTION_FAILED",
              message: error instanceof Error ? error.message : String(error),
              retryable: true,
              capability: "DATABASE",
            };
      if (requestedChannels.has("KEYWORD")) {
        channelBlockers.set("KEYWORD", blocker);
      }
      if (requestedChannels.has("VARIANT")) {
        channelBlockers.set("VARIANT", blocker);
      }
    }
  }

  const vectorStorage =
    input.vectorStorage !== undefined
      ? { reference: input.vectorStorage }
      : selectFirstServiceImplementation(pluginManager, "VECTOR_STORAGE");
  const vectorizer = selectFirstServiceImplementation(
    pluginManager,
    "TEXT_VECTORIZER",
  );

  if (requestedChannels.has("SEMANTIC") && vectorStorage) {
    let queryVectors: number[][] | undefined;
    let semanticInputAvailable = false;

    if (!vectorizer) {
      channelBlockers.set("SEMANTIC", {
        reason: "CAPABILITY_UNAVAILABLE",
        message: "Text vectorization is unavailable for semantic recall.",
        retryable: false,
        capability: "TEXT_VECTORIZER",
      });
    } else if (
      !vectorizer.service.canVectorize({
        languageId: input.sourceLanguageId,
      })
    ) {
      channelBlockers.set("SEMANTIC", {
        reason: "CAPABILITY_UNAVAILABLE",
        message: "Text vectorization is unavailable for semantic recall.",
        retryable: false,
        capability: "TEXT_VECTORIZER",
      });
    } else {
      try {
        ctx?.signal?.throwIfAborted();
        const vectorized = await vectorizer.service.vectorize({
          elements: [{ text: input.text, languageId: input.sourceLanguageId }],
          ...(ctx?.signal === undefined ? {} : { signal: ctx.signal }),
        });
        ctx?.signal?.throwIfAborted();
        const vectorizedChunks = vectorized[0] ?? [];
        if (vectorizedChunks.length === 0) {
          semanticInputAvailable = false;
        } else if (
          vectorizedChunks.some((chunk) => chunk.vector.length === 0)
        ) {
          setExecutionBlocker(
            "SEMANTIC",
            new Error("Text vectorizer returned an empty vector."),
            "TEXT_VECTORIZER",
          );
        } else {
          queryVectors = vectorizedChunks.map((chunk) => chunk.vector);
          semanticInputAvailable = true;
        }
      } catch (error) {
        ctx?.signal?.throwIfAborted();
        setExecutionBlocker("SEMANTIC", error, "TEXT_VECTORIZER");
      }
    }
    if (!channelBlockers.has("SEMANTIC") && semanticInputAvailable) {
      try {
        ctx?.signal?.throwIfAborted();
        const vectorResults = await searchMemoryOp(
          {
            chunkIds: [],
            queryVectors,
            memoryIds: input.memoryIds,
            sourceLanguageId: input.sourceLanguageId,
            translationLanguageId: input.translationLanguageId,
            minSimilarity: input.minSimilarity,
            maxAmount: input.maxAmount,
            vectorStorage: vectorStorage.reference,
          },
          ctx,
        );
        await Promise.all(
          vectorResults.memories.map(async (r) =>
            pushResult("SEMANTIC", r.id, {
              ...r,
              matchedText: r.matchedText ?? r.source,
              evidences: [
                ...r.evidences,
                {
                  channel: "semantic" as const,
                  matchedText: r.matchedText ?? r.source,
                  confidence: r.confidence,
                  note: "vector semantic match",
                },
              ],
            }),
          ),
        );
      } catch (err) {
        ctx?.signal?.throwIfAborted();
        setExecutionBlocker("SEMANTIC", err, "VECTOR_STORAGE");
      }
    }
  } else if (requestedChannels.has("SEMANTIC")) {
    channelBlockers.set("SEMANTIC", {
      reason: "CAPABILITY_UNAVAILABLE",
      message: vectorStorage
        ? "Text vectorization is unavailable for semantic recall."
        : "Vector storage is unavailable for semantic recall.",
      retryable: false,
      capability: vectorStorage ? "TEXT_VECTORIZER" : "VECTOR_STORAGE",
    });
  }

  for (const channel of input.channels) {
    if (channelBlockers.has(channel) || channelSkips.has(channel)) continue;
    const channelCandidates = staged.get(channel);
    if (!channelCandidates) {
      throw new TypeError(`Missing Candidate Channel stage for ${channel}.`);
    }
    for (const [id, candidate] of channelCandidates) {
      seen.set(id, mergeSuggestions(seen.get(id), candidate));
    }
  }

  // The seen Map already holds per-item merged suggestions from all channels.
  // Convert to RawMemoryResult for the precision pipeline.
  const rawMemoryResults = [...seen.values()].map(
    (m): RawMemoryResult => ({
      surface: "memory",
      id: m.id,
      memoryId: m.memoryId,
      source: m.source,
      translation: m.translation,
      confidence: m.confidence,
      matchedText: m.matchedText,
      matchedVariantText: m.matchedVariantText,
      matchedVariantType: m.matchedVariantType,
      adaptedTranslation: m.adaptedTranslation,
      adaptationMethod: m.adaptationMethod,
      evidences: m.evidences,
    }),
  );

  const sparseContentWords = sourceLanguageAnalysisTokens
    ? sourceLanguageAnalysisTokens
        .filter((token) => !token.isStop && !token.isPunct)
        .map((token) => normalizeTokenLemma(token).toLowerCase())
    : [];
  if (sparseContentWords.length > 0) {
    augmentWithSparseLane(rawMemoryResults, sparseContentWords);
  }

  // Pre-pipeline hard-negative filtering.
  const hnfPreRemovals: Array<{
    surface: string;
    candidateKey: string;
    reason: string;
    stage: string;
    detail?: string;
  }> = [];

  if (sourceLanguageAnalysisTokens && sourceLanguageAnalysisTokens.length > 0) {
    const hnfPreResult = applyMemoryHnfPre(
      rawMemoryResults,
      sourceLanguageAnalysisTokens,
      input.text,
    );
    hnfPreRemovals.push(...hnfPreResult);

    if (hnfPreResult.length > 0) {
      logger
        .child({ component: "operation" })
        .info(
          `HNF_pre(memory): removed ${hnfPreResult.length} hard negatives (reasons: ${[...new Set(hnfPreResult.map((r) => r.reason))].join(", ")})`,
        );
    }
  }

  const ranked = await runPrecisionPipeline(rawMemoryResults, {
    queryText: input.text,
    maxResults: input.maxAmount,
    pluginManager,
    signal: ctx?.signal,
    rerankMode: input.rerankMode,
    rerankProvider: input.rerankProvider,
    rerankTimeoutMs: input.rerankTimeoutMs,
  });

  // Post-pipeline semantic-isolation filtering.
  let hnfPostRemovals: Array<{
    surface: string;
    candidateKey: string;
    reason: string;
    stage: string;
    detail?: string;
  }> = [];

  if (sourceLanguageAnalysisTokens && sourceLanguageAnalysisTokens.length > 0) {
    hnfPostRemovals = applyMemoryHnfPost(ranked, sourceLanguageAnalysisTokens);

    if (hnfPostRemovals.length > 0) {
      logger
        .child({ component: "operation" })
        .info(
          `HNF_post(memory): removed ${hnfPostRemovals.length} tier-3 isolated semantic candidates`,
        );
    }
  }

  // Filter out hardFiltered candidates from ranked
  const filteredRanked = ranked.filter((c) => !c.hardFiltered);

  // Self-exclusion filtering.
  const memoryCandidates = filteredRanked.filter(
    (c): c is RecallCandidate & { surface: "memory" } => c.surface === "memory",
  );
  const selfExcluded = applySelfExclusion(
    memoryCandidates,
    input.excludeMemoryItemIds,
  );

  // Re-attach full MemorySuggestion fields from seen Map (createdAt, updatedAt, etc.)
  const finalCandidates = selfExcluded.flatMap(
    (c): MemorySuggestionWithPrecision[] => {
      if (c.surface !== "memory") return [];
      const raw = seen.get(c.id);
      if (!raw) return [];
      return [
        {
          ...raw,
          confidence: c.confidence,
          evidences: c.evidences,
          rankingDecisions: c.rankingDecisions,
        },
      ];
    },
  );

  const lanesByChannel = {
    EXACT: new Set(["exact"]),
    FUZZY: new Set(["trgm"]),
    KEYWORD: new Set(["keyword"]),
    VARIANT: new Set(["morphological", "template", "fragment"]),
    SEMANTIC: new Set(["semantic"]),
  } as const satisfies Record<CandidateChannel, ReadonlySet<string>>;
  const outcome = (
    channel: CandidateChannel,
  ): CandidateChannelOutcome<MemorySuggestionWithPrecision> => {
    if (!requestedChannels.has(channel)) {
      return { status: "SKIPPED", reason: "NOT_REQUESTED" };
    }
    const skipReason = channelSkips.get(channel);
    if (skipReason) return { status: "SKIPPED", reason: skipReason };
    const blocker = channelBlockers.get(channel);
    if (blocker) return { status: "BLOCKED", blocker };
    const channelCandidates = finalCandidates.filter((candidate) =>
      candidate.evidences.some((evidence) =>
        lanesByChannel[channel].has(evidence.channel),
      ),
    );
    if (channelCandidates.length > 0) {
      return createSucceededCandidateChannelOutcome(channelCandidates);
    }
    return { status: "EMPTY" };
  };
  const result = MemoryRecallResultSchema.parse({
    requestedChannels: input.channels,
    outcomes: {
      EXACT: outcome("EXACT"),
      FUZZY: outcome("FUZZY"),
      KEYWORD: outcome("KEYWORD"),
      VARIANT: outcome("VARIANT"),
      SEMANTIC: outcome("SEMANTIC"),
    },
  });
  assertRecallOperationAvailable(result);
  return result;
};

export const getMemoryRecallCandidates = (
  result: MemoryRecallResult,
): MemoryRecallCandidate[] =>
  getCandidateRecallCandidates(result, (candidate) => `${candidate.id}`);
