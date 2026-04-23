import type { OperationContext } from "@cat/domain";
import type { SlotMappingEntry } from "@cat/shared/schema/drizzle/memory";
import type { MemorySuggestion } from "@cat/shared/schema/misc";

import {
  executeQuery,
  getDbHandle,
  listExactMemorySuggestions,
  listTrgmMemorySuggestions,
  listVariantMemorySuggestions,
} from "@cat/domain";
import {
  firstOrGivenService,
  resolvePluginManager,
  serverLogger as logger,
} from "@cat/server-shared";
import * as z from "zod";

import type { MemorySuggestionWithPrecision, RawMemoryResult } from "./precision/types";

import {
  fillTemplate,
  mappingToSlots,
  placeholderize,
} from "./memory-template";
import { joinLemmas } from "./nlp-normalization";
import { augmentWithSparseLane } from "./precision/sparse-lane";
import { runPrecisionPipeline } from "./precision/precision-pipeline";
import { searchMemoryOp } from "./search-memory";
import { tokenizeOp } from "./tokenize";

export const CollectMemoryRecallInputSchema = z.object({
  text: z.string(),
  normalizedText: z.string().optional(),
  sourceLanguageId: z.string(),
  translationLanguageId: z.string(),
  memoryIds: z.array(z.uuid()),
  minSimilarity: z.number().min(0).max(1).default(0.72),
  minVariantSimilarity: z.number().min(0).max(1).default(0.7),
  maxAmount: z.int().min(1).default(5),
  chunkIds: z.array(z.int()).default([]),
  queryVectors: z.array(z.array(z.number())).optional(),
  vectorStorageId: z.int().optional(),
  /** Pre-tokenized NLP tokens for the source text. */
  sourceNlpTokens: z
    .array(
      z.object({
        text: z.string(),
        lemma: z.string(),
        pos: z.string(),
        start: z.int(),
        end: z.int(),
        isStop: z.boolean(),
        isPunct: z.boolean(),
      }),
    )
    .optional(),
});

export type CollectMemoryRecallInput = z.input<
  typeof CollectMemoryRecallInputSchema
>;

/**
 * Aggregated memory recall — multi-channel evidence merge.
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
): Promise<MemorySuggestionWithPrecision[]> => {
  const input = CollectMemoryRecallInputSchema.parse(data);
  if (input.memoryIds.length === 0) return [];

  const { client: drizzle } = await getDbHandle();
  const pluginManager = resolvePluginManager(ctx?.pluginManager);

  const text = input.text;
  const normalizedText =
    input.normalizedText ??
    (input.sourceNlpTokens && input.sourceNlpTokens.length > 0
      ? joinLemmas(
          input.sourceNlpTokens.filter(
            (token) => !token.isStop && !token.isPunct,
          ),
          input.sourceLanguageId,
        )
      : text.toLowerCase());

  const commonInput = {
    text,
    sourceLanguageId: input.sourceLanguageId,
    translationLanguageId: input.translationLanguageId,
    memoryIds: input.memoryIds,
    maxAmount: input.maxAmount,
  };

  // Lazy-compute current source template
  let currentSourceTemplate: string | null = null;
  let currentSourceSlotsPromise:
    | Promise<ReturnType<typeof placeholderize>["slots"] | null>
    | undefined;

  const ensureCurrentSourceTemplate = async () => {
    if (!currentSourceSlotsPromise) {
      currentSourceSlotsPromise = tokenizeOp({ text })
        .then(({ tokens }) => {
          const result = placeholderize(tokens, text);
          currentSourceTemplate = result.template;
          return result.slots;
        })
        .catch(() => null);
    }
    return currentSourceSlotsPromise;
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

    const currentSlots = await ensureCurrentSourceTemplate();
    if (!currentSlots || currentSourceTemplate !== sourceTemplate) {
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
      currentSlots,
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

  // Global dedup: memoryItemId → suggestion (keep highest confidence + merged evidences)
  const seen = new Map<number, MemorySuggestion>();

  const pushResult = async (
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
      sourceTemplate?: string | null;
      translationTemplate?: string | null;
      slotMapping?: SlotMappingEntry[] | null;
      matchedVariantText?: string;
      matchedVariantType?: string;
      matchedText?: string;
      evidences?: MemorySuggestion["evidences"];
    },
  ) => {
    const suggestion: MemorySuggestion = {
      id,
      source: raw.source,
      translation: raw.translation,
      translationChunkSetId: raw.translationChunkSetId,
      memoryId: raw.memoryId,
      creatorId: raw.creatorId,
      confidence: raw.confidence,
      createdAt: raw.createdAt,
      updatedAt: raw.updatedAt,
      matchedText: raw.matchedText,
      matchedVariantText: raw.matchedVariantText,
      matchedVariantType: raw.matchedVariantType,
      evidences: raw.evidences ? [...raw.evidences] : [],
    };

    const adapted = await tryAdapt(
      suggestion,
      raw.sourceTemplate ?? null,
      raw.translationTemplate ?? null,
      raw.slotMapping ?? null,
    );

    seen.set(id, mergeSuggestions(seen.get(id), adapted));
  };

  // Channel 1: Exact match
  try {
    const exactResults = await executeQuery(
      { db: drizzle },
      listExactMemorySuggestions,
      commonInput,
    );
    await Promise.all(exactResults.map(async (r) => pushResult(r.id, r)));
  } catch (err) {
    logger
      .withSituation("OP")
      .error(err, "collectMemoryRecallOp: exact match failed");
  }

  // Channel 2: trgm similarity
  try {
    const trgmResults = await executeQuery(
      { db: drizzle },
      listTrgmMemorySuggestions,
      { ...commonInput, minSimilarity: input.minSimilarity },
    );
    await Promise.all(trgmResults.map(async (r) => pushResult(r.id, r)));
  } catch (err) {
    logger
      .withSituation("OP")
      .error(err, "collectMemoryRecallOp: trgm match failed");
  }

  // Channel 3: Variant-based (morphological / template / fragment)
  try {
    const variantResults = await executeQuery(
      { db: drizzle },
      listVariantMemorySuggestions,
      {
        text,
        normalizedText,
        sourceLanguageId: input.sourceLanguageId,
        translationLanguageId: input.translationLanguageId,
        memoryIds: input.memoryIds,
        minSimilarity: input.minVariantSimilarity,
        maxAmount: input.maxAmount,
      },
    );
    await Promise.all(variantResults.map(async (r) => pushResult(r.id, r)));
  } catch (err) {
    logger
      .withSituation("OP")
      .error(err, "collectMemoryRecallOp: variant match failed");
  }

  const vectorStorage =
    input.vectorStorageId !== undefined
      ? { id: input.vectorStorageId }
      : firstOrGivenService(pluginManager, "VECTOR_STORAGE");
  const vectorizer = firstOrGivenService(pluginManager, "TEXT_VECTORIZER");

  if (
    vectorStorage &&
    (input.chunkIds.length > 0 ||
      (input.queryVectors && input.queryVectors.length > 0) ||
      vectorizer)
  ) {
    try {
      const vectorResults = await searchMemoryOp(
        {
          chunkIds: input.chunkIds,
          ...(input.queryVectors ? { queryVectors: input.queryVectors } : {}),
          memoryIds: input.memoryIds,
          sourceLanguageId: input.sourceLanguageId,
          translationLanguageId: input.translationLanguageId,
          minSimilarity: input.minSimilarity,
          maxAmount: input.maxAmount,
          vectorStorageId: vectorStorage.id,
        },
        ctx,
      );
      await Promise.all(
        vectorResults.memories.map(async (r) =>
          pushResult(r.id, {
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
      logger
        .withSituation("OP")
        .error(err, "collectMemoryRecallOp: semantic match failed");
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

  // ── Sparse Lexical Lane ───────────────────────────────────────────
  const sparseContentWords = input.sourceNlpTokens
    ? input.sourceNlpTokens
        .filter((t) => !t.isStop && !t.isPunct)
        .map((t) => t.lemma.toLowerCase())
    : text.toLowerCase().split(/\s+/).filter(Boolean);
  augmentWithSparseLane(rawMemoryResults, sparseContentWords);

  const ranked = await runPrecisionPipeline(rawMemoryResults, {
    queryText: input.text,
    maxResults: input.maxAmount,
  });

  // Re-attach full MemorySuggestion fields from seen Map (createdAt, updatedAt, etc.)
  return ranked.flatMap((c): MemorySuggestionWithPrecision[] => {
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
  });
};
