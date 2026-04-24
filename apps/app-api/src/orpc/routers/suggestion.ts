import {
  executeQuery,
  getElementWithChunkIds,
  listMemoryIdsByProject,
  listNeighborElements,
  listProjectGlossaryIds,
} from "@cat/domain";
import {
  collectMemoryRecallOp,
  type MemorySuggestionWithPrecision,
  smartSuggestOp,
  termRecallOp,
} from "@cat/operations";
import {
  AsyncMessageQueue,
  hash,
  serverLogger as logger,
} from "@cat/server-shared";
import {
  TranslationSuggestionSchema,
  type TranslationSuggestion,
} from "@cat/shared/schema/plugin";
import {
  fetchAdviseGraph,
  getGlobalGraphRuntime,
  runGraph,
} from "@cat/workflow/tasks";
import * as z from "zod";

import { authed, checkElementPermission } from "@/orpc/server";

export const onNew = authed
  .input(z.object({ elementId: z.int(), languageId: z.string() }))
  .use(checkElementPermission("viewer"), (i) => i.elementId)
  .handler(async function* ({ context, input }) {
    const SuggestionEventPayloadSchema = z.object({
      elementId: z.int(),
      suggestion: TranslationSuggestionSchema.extend({
        advisorId: z.int().optional(),
      }),
    });
    const {
      cacheStore,
      drizzleDB: { client: drizzle },
      pluginManager,
    } = context;
    const { elementId, languageId } = input;

    // ── Load element and project bindings ────────────────────────────────────
    const element = await executeQuery(
      { db: drizzle },
      getElementWithChunkIds,
      { elementId },
    );

    if (element === null) {
      throw new Error(`Element with ID ${elementId} not found`);
    }

    const [glossaryIds, memoryIds] = await Promise.all([
      executeQuery({ db: drizzle }, listProjectGlossaryIds, {
        projectId: element.projectId,
      }),
      executeQuery({ db: drizzle }, listMemoryIdsByProject, {
        projectId: element.projectId,
      }),
    ]);

    // ── Assemble suggestion context once (shared by Smart Suggest + advisors) ─
    const [recalledMemories, termContext, neighbors] = await Promise.all([
      memoryIds.length > 0
        ? collectMemoryRecallOp(
            {
              text: element.value,
              sourceLanguageId: element.languageId,
              translationLanguageId: languageId,
              memoryIds,
              chunkIds: element.chunkIds,
            },
            { pluginManager, traceId: crypto.randomUUID() },
          ).catch((err: unknown) => {
            logger
              .withSituation("RPC")
              .warn(
                { err },
                "suggestion.onNew: memory recall failed, continuing without",
              );
            return [] as MemorySuggestionWithPrecision[];
          })
        : Promise.resolve([]),
      glossaryIds.length > 0
        ? termRecallOp(
            {
              text: element.value,
              sourceLanguageId: element.languageId,
              translationLanguageId: languageId,
              glossaryIds,
            },
            { pluginManager, traceId: crypto.randomUUID() },
          ).catch((err: unknown) => {
            logger
              .withSituation("RPC")
              .warn(
                { err },
                "suggestion.onNew: term recall failed, continuing without",
              );
            return { terms: [] };
          })
        : Promise.resolve({ terms: [] }),
      executeQuery({ db: drizzle }, listNeighborElements, {
        elementId,
        windowSize: 3,
      }).catch(() => []),
    ]);

    // Flatten context for downstream consumers
    const preloadedMemoriesForAdvisors = recalledMemories.map((m) => ({
      source: m.source,
      translation: m.adaptedTranslation ?? m.translation,
      confidence: m.confidence,
    }));

    const preloadedTermsForAdvisors = termContext.terms.map((t) => ({
      term: t.term,
      translation: t.translation,
      confidence: t.confidence,
      definition: t.definition,
      concept: t.concept,
    }));

    const neighborTranslations = neighbors
      .map((n) =>
        n.approvedTranslation
          ? { source: n.value, translation: n.approvedTranslation }
          : null,
      )
      .filter((n): n is NonNullable<typeof n> => n !== null);

    // ── Suggestion queue (receives both Smart Suggest and advisor results) ────
    const suggestionsQueue = new AsyncMessageQueue<TranslationSuggestion>();

    const unsubscribe = getGlobalGraphRuntime().eventBus.subscribe(
      "workflow:suggestion:ready",
      async (event) => {
        const parsed = await SuggestionEventPayloadSchema.safeParseAsync(
          event.payload,
        );
        if (!parsed.success) {
          logger
            .withSituation("RPC")
            .error(parsed.error, "Invalid suggestion format");
          return;
        }

        if (parsed.data.elementId !== elementId) {
          return;
        }

        suggestionsQueue.push(parsed.data.suggestion);
      },
    );

    const advisors = pluginManager.getServices("TRANSLATION_ADVISOR");

    // ── Run Smart Suggestion and external advisors concurrently ──────────────
    const smartSuggestTask = smartSuggestOp(
      {
        sourceText: element.value,
        sourceLanguageId: element.languageId,
        targetLanguageId: languageId,
        memories: recalledMemories.map((m) => ({
          source: m.source,
          translation: m.translation,
          adaptedTranslation: m.adaptedTranslation,
          confidence: m.confidence,
        })),
        terms: termContext.terms.map((t) => ({
          term: t.term,
          translation: t.translation,
          definition: t.definition,
        })),
        neighborTranslations,
      },
      { pluginManager, traceId: crypto.randomUUID() },
    )
      .then(({ suggestion }) => {
        if (suggestion) {
          suggestionsQueue.push(suggestion);
        }
      })
      .catch((err: unknown) => {
        logger
          .withSituation("RPC")
          .warn(
            { err },
            "suggestion.onNew: Smart Suggestion failed, continuing",
          );
      });

    const advisorTasks = advisors.map(async (advisor) => {
      const elementHash = hash({
        ...element,
        targetLanguageId: languageId,
        advisorId: advisor.dbId,
      });
      const cacheKey = `cache:suggestions:${elementHash}`;

      const cached = await cacheStore.get<TranslationSuggestion[]>(cacheKey);
      if (cached && cached.length > 0) {
        for (const s of cached) {
          suggestionsQueue.push(s);
        }
        return;
      }

      const { suggestions } = await runGraph(
        fetchAdviseGraph,
        {
          text: element.value,
          glossaryIds,
          memoryIds,
          advisorId: advisor.dbId,
          sourceLanguageId: element.languageId,
          translationLanguageId: languageId,
          eventElementId: elementId,
          eventAdvisorId: advisor.dbId,
          preloadedMemories: preloadedMemoriesForAdvisors,
          preloadedTerms: preloadedTermsForAdvisors,
        },
        {
          pluginManager,
        },
      );

      const advisorSuggestions = suggestions.map((suggestion) => ({
        ...suggestion,
        advisorId: advisor.dbId,
      }));

      await cacheStore.set(cacheKey, advisorSuggestions, 60 * 60);
    });

    void Promise.all([smartSuggestTask, ...advisorTasks])
      .then(() => {
        suggestionsQueue.close();
      })
      .catch((err: unknown) => {
        logger.withSituation("RPC").error(err, "Error processing suggestions");
        suggestionsQueue.close();
      });

    try {
      for await (const suggestion of suggestionsQueue.consume()) {
        yield suggestion;
      }
    } finally {
      unsubscribe();
      suggestionsQueue.clear();
    }
  });
