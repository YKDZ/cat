import type { OperationContext } from "@cat/domain";
import type { MemorySuggestion } from "@cat/shared/schema/misc";

/**
 * @module stream-search-memory
 *
 * Three-channel streaming memory search operation.
 *
 * Simultaneously launches three search strategies, deduplicates by memoryItem.id,
 * and streams results via {@link AsyncMessageQueue}:
 *
 * 1. **Exact match** (fastest): SQL `value = input`, confidence = 1.0
 * 2. **trgm similarity** (fast): `similarity() >= threshold`, confidence = similarity()
 * 3. **Vector semantic** (slow): cosine similarity via vector storage
 *
 * Results are globally deduplicated by `memoryItem.id`, keeping the highest confidence.
 */
import { getDbHandle } from "@cat/domain";
import {
  executeQuery,
  listExactMemorySuggestions,
  listTrgmMemorySuggestions,
  type RawMemorySuggestion,
} from "@cat/domain";
import { PluginManager } from "@cat/plugin-core";
import { firstOrGivenService } from "@cat/server-shared";
import { AsyncMessageQueue } from "@cat/server-shared";
import { serverLogger as logger } from "@cat/server-shared";
import * as z from "zod";

import {
  fillTemplate,
  mappingToSlots,
  placeholderize,
  type PlaceholderSlot,
} from "./memory-template";
import { searchMemoryOp } from "./search-memory";
import { tokenizeOp } from "./tokenize";

export const StreamSearchMemoryInputSchema = z.object({
  text: z.string(),
  sourceLanguageId: z.string(),
  translationLanguageId: z.string(),
  memoryIds: z.array(z.uuidv4()),
  /** Chunk IDs for the source element (used by vector channel). */
  chunkIds: z.array(z.int()),
  minSimilarity: z.number().min(0).max(1).optional().default(0.72),
  maxAmount: z.int().min(1).optional().default(3),
});

export type StreamSearchMemoryInput = z.input<
  typeof StreamSearchMemoryInputSchema
>;

/**
 * Three-channel streaming memory search.
 *
 * Returns an AsyncIterable that yields MemorySuggestion items as they arrive
 * from the three channels. Exact matches arrive first, followed by trgm,
 * then vector results.
 *
 * For non-exact results that have stored templates, attempts deterministic
 * placeholder replacement to produce an `adaptedTranslation`.
 */
export const streamSearchMemoryOp = (
  data: StreamSearchMemoryInput,
  ctx?: OperationContext,
): AsyncIterable<MemorySuggestion> => {
  const queue = new AsyncMessageQueue<MemorySuggestion>();
  // Global dedup by memoryItem.id — keep the highest confidence
  const seenIds = new Map<number, number>(); // id → confidence

  // Lazy-computed current source template (shared across all channels)
  let currentSourceSlotsPromise: Promise<PlaceholderSlot[] | null> | undefined;
  let currentSourceTemplate: string | null = null;

  const ensureCurrentSourceTemplate = async (): Promise<
    PlaceholderSlot[] | null
  > => {
    if (!currentSourceSlotsPromise) {
      currentSourceSlotsPromise = tokenizeOp({ text: data.text })
        .then(({ tokens }) => {
          const result = placeholderize(tokens, data.text);
          currentSourceTemplate = result.template;
          return result.slots;
        })
        .catch(() => null);
    }
    return currentSourceSlotsPromise;
  };

  /**
   * Attempt template-based adaptation for a single memory result.
   * If the stored source template matches the current input template,
   * fill the translation template with substituted values.
   */
  const tryAdapt = async (
    raw: RawMemorySuggestion,
  ): Promise<MemorySuggestion> => {
    // Strip internal template fields for the final output
    const { sourceTemplate, translationTemplate, slotMapping, ...suggestion } =
      raw;

    // Skip if no templates stored or already exact
    if (
      !sourceTemplate ||
      !translationTemplate ||
      !slotMapping ||
      suggestion.adaptationMethod === "exact"
    ) {
      return suggestion;
    }

    const currentSlots = await ensureCurrentSourceTemplate();
    if (!currentSlots || currentSourceTemplate !== sourceTemplate) {
      // Templates don't match — no adaptation possible
      return suggestion;
    }

    // Recover stored slots (src: and tgt: prefixed in slotMapping)
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

  const pushNew = async (memories: RawMemorySuggestion[]) => {
    // Adapt all results in parallel to avoid sequential await
    const adapted = await Promise.all(
      memories.map(async (m) => ({ m, suggestion: await tryAdapt(m) })),
    );
    for (const { m, suggestion } of adapted) {
      const existing = seenIds.get(m.id);
      if (existing !== undefined) {
        continue;
      }
      seenIds.set(m.id, m.confidence);
      queue.push(suggestion);
    }
  };

  const run = async () => {
    const { client: drizzle } = await getDbHandle();
    const pluginManager = PluginManager.get("GLOBAL", "");
    const vectorStorage = firstOrGivenService(pluginManager, "VECTOR_STORAGE");

    const commonInput = {
      text: data.text,
      sourceLanguageId: data.sourceLanguageId,
      translationLanguageId: data.translationLanguageId,
      memoryIds: data.memoryIds,
      maxAmount: data.maxAmount ?? 3,
    };

    // Launch all channels concurrently.
    // Channel 1 (exact) and Channel 2 (trgm) are pure SQL — fast.
    // Channel 3 (vector) requires vectorization — slower.
    const tasks: Promise<void>[] = [
      // Channel 1: Exact match
      executeQuery({ db: drizzle }, listExactMemorySuggestions, commonInput)
        .then(async (results) => {
          await pushNew(results);
        })
        .catch((err: unknown) => {
          logger
            .withSituation("OP")
            .error(err, "streamSearchMemoryOp: exact match failed");
        }),

      // Channel 2: trgm similarity
      executeQuery({ db: drizzle }, listTrgmMemorySuggestions, {
        ...commonInput,
        minSimilarity: data.minSimilarity ?? 0.72,
      })
        .then(async (results) => {
          await pushNew(results);
        })
        .catch((err: unknown) => {
          logger
            .withSituation("OP")
            .error(err, "streamSearchMemoryOp: trgm match failed");
        }),
    ];

    // Channel 3: Vector semantic search (only if vector storage is available)
    if (vectorStorage) {
      const vectorTask = (async (): Promise<void> => {
        // If pre-stored chunkIds are available, use them directly.
        // Otherwise, vectorize the raw text on the fly.
        let queryVectors: number[][] | undefined;

        if (data.chunkIds.length === 0) {
          const vectorizer = firstOrGivenService(
            pluginManager,
            "TEXT_VECTORIZER",
          );
          if (!vectorizer) {
            logger
              .withSituation("OP")
              .warn(
                "streamSearchMemoryOp: no TEXT_VECTORIZER available, skipping vector channel",
              );
            return;
          }
          const vectorized = await vectorizer.service.vectorize({
            elements: [
              {
                text: data.text,
                languageId: data.sourceLanguageId,
              },
            ],
          });
          queryVectors = vectorized.flatMap((chunks) =>
            chunks.map((c) => c.vector),
          );
          if (queryVectors.length === 0) return;
        }

        const { memories } = await searchMemoryOp(
          {
            chunkIds: data.chunkIds,
            ...(queryVectors ? { queryVectors } : {}),
            memoryIds: data.memoryIds,
            sourceLanguageId: data.sourceLanguageId,
            translationLanguageId: data.translationLanguageId,
            minSimilarity: data.minSimilarity ?? 0.72,
            maxAmount: data.maxAmount ?? 3,
            vectorStorageId: vectorStorage.id,
          },
          ctx,
        );

        const enriched: RawMemorySuggestion[] = memories.map((m) => ({
          ...m,
          confidence: m.confidence,
          sourceTemplate: null,
          translationTemplate: null,
          slotMapping: null,
        }));
        await pushNew(enriched);
      })();

      tasks.push(
        vectorTask.catch((err: unknown) => {
          logger
            .withSituation("OP")
            .error(err, "streamSearchMemoryOp: vector search failed");
        }),
      );
    }

    await Promise.all(tasks);
  };

  void run()
    .catch((err: unknown) => {
      logger.withSituation("OP").error(err, "streamSearchMemoryOp failed");
    })
    .finally(() => {
      queue.close();
    });

  return queue.consume();
};
