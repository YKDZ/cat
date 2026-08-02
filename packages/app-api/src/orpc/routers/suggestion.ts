import {
  executeQuery,
  getElementWithChunkIds,
  listEffectiveMemoryIdsByProject,
  listMemoryItemIdsByElement,
  listProjectGlossaryIds,
} from "@cat/domain";
import {
  collectEffectiveMemoryRecallOp,
  createSuggestionCollector,
  llmTranslateOp,
  languageAnalyzeOp,
  type MemorySuggestionWithPrecision,
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
} from "@cat/shared";
import {
  fetchAdviseGraph,
  getGlobalGraphRuntime,
  runGraph,
} from "@cat/workflow/tasks";
import * as z from "zod";

import { authed, checkElementPermission } from "#/orpc/server.ts";
import { throwLanguageAnalysisOperationFailure } from "#/services/language-analysis-operation-failure.ts";

type EffectiveMemoryIds = {
  projectMemoryIds: string[];
  personalMemoryIds: string[];
  allMemoryIds: string[];
};

const normalizeEffectiveMemoryIds = (
  input: EffectiveMemoryIds | string[],
): EffectiveMemoryIds => {
  if (Array.isArray(input)) {
    return {
      projectMemoryIds: input,
      personalMemoryIds: [],
      allMemoryIds: input,
    };
  }

  return input;
};

export const onNew = authed
  .input(
    z.object({
      elementId: z.int(),
      languageId: z.string(),
      sessionTranslations: z
        .array(
          z.object({
            elementId: z.int(),
            source: z.string(),
            translation: z.string(),
            preservedAsIs: z.boolean().default(false),
          }),
        )
        .default([]),
    }),
  )
  .use(checkElementPermission("viewer"), (i) => i.elementId)
  .handler(async function* ({ context, input }) {
    const SuggestionEventPayloadSchema = z.object({
      elementId: z.int(),
      suggestion: TranslationSuggestionSchema,
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

    const [glossaryIds, effectiveMemoryIdsRaw] = await Promise.all([
      executeQuery({ db: drizzle }, listProjectGlossaryIds, {
        projectId: element.projectId,
      }),
      executeQuery({ db: drizzle }, listEffectiveMemoryIdsByProject, {
        projectId: element.projectId,
        userId: context.user.id,
      }),
    ]);

    const effectiveMemoryIds = normalizeEffectiveMemoryIds(
      effectiveMemoryIdsRaw,
    );

    const { projectMemoryIds, personalMemoryIds, allMemoryIds } =
      effectiveMemoryIds;

    // ── Query memory item IDs for self-exclusion ──────────────────────
    const excludeMemoryItemIds = await executeQuery(
      { db: drizzle },
      listMemoryItemIdsByElement,
      { elementId },
    ).catch((err: unknown) => {
      logger
        .child({ component: "rpc" })
        .warn(
          "suggestion.onNew: listMemoryItemIdsByElement failed, skipping self-exclusion",
          { err },
        );
      return [] as string[];
    });

    // ── Language Analysis (once, shared by memory + term recall) ─────
    const languageAnalysis = await (async () => {
      try {
        return await languageAnalyzeOp(
          {
            text: element.value,
            languageId: element.languageId,
          },
          {
            pluginManager,
            signal: context.requestSignal,
            traceId: crypto.randomUUID(),
          },
        );
      } catch (error) {
        return await throwLanguageAnalysisOperationFailure({
          context,
          error,
          affectedResources: [
            { type: "PROJECT", id: element.projectId },
            { type: "ELEMENT", id: String(elementId) },
          ],
        });
      }
    })();
    const sourceLanguageAnalysisTokens = languageAnalysis.tokens;
    const sourceLanguageAnalysisVersion =
      languageAnalysis.languageAnalysisVersion;

    // ── Assemble suggestion context once (shared by Smart Suggest + advisors) ─
    const [recalledMemories, termContext] = await Promise.all([
      allMemoryIds.length > 0
        ? collectEffectiveMemoryRecallOp(
            {
              text: element.value,
              sourceLanguageId: element.languageId,
              translationLanguageId: languageId,
              projectMemoryIds,
              personalMemoryIds,
              chunkIds: element.chunkIds,
              excludeMemoryItemIds,
              sourceLanguageAnalysisTokens,
              sourceLanguageAnalysisVersion,
            },
            {
              pluginManager,
              signal: context.requestSignal,
              traceId: crypto.randomUUID(),
            },
          ).catch((err: unknown) => {
            logger
              .child({ component: "rpc" })
              .warn(
                "suggestion.onNew: memory recall failed, continuing without",
                { err },
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
            {
              pluginManager,
              signal: context.requestSignal,
              traceId: crypto.randomUUID(),
            },
          ).catch((err: unknown) => {
            logger
              .child({ component: "rpc" })
              .warn(
                "suggestion.onNew: term recall failed, continuing without",
                { err },
              );
            return { terms: [] };
          })
        : Promise.resolve({ terms: [] }),
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
            .child({ component: "rpc" })
            .error("Invalid suggestion format", { error: parsed.error });
          return;
        }

        if (parsed.data.elementId !== elementId) {
          return;
        }

        suggestionsQueue.push(parsed.data.suggestion);
      },
    );

    const advisors = pluginManager.getServices("TRANSLATION_ADVISOR");

    // ── Run LLM Translate and external advisors concurrently ──────────────
    const llmTranslateTask = llmTranslateOp(
      {
        elementId,
        targetLanguageId: languageId,
        config: {},
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
        sessionTranslations: input.sessionTranslations,
      },
      {
        pluginManager,
        signal: context.requestSignal,
        traceId: crypto.randomUUID(),
      },
    )
      .then(({ suggestion }) => {
        if (suggestion) {
          suggestionsQueue.push(suggestion);
        }
      })
      .catch((err: unknown) => {
        logger
          .child({ component: "rpc" })
          .warn("suggestion.onNew: LLM Translate failed, continuing", { err });
      });

    const advisorTasks = advisors.map(async (advisor) => {
      const elementHash = hash({
        ...element,
        targetLanguageId: languageId,
        advisor: pluginManager.createServiceImplementationReference(advisor),
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
          memoryIds: allMemoryIds,
          advisor: pluginManager.createServiceImplementationReference(advisor),
          sourceLanguageId: element.languageId,
          translationLanguageId: languageId,
          eventElementId: elementId,
          eventAdvisor:
            pluginManager.createServiceImplementationReference(advisor),
          preloadedMemories: preloadedMemoriesForAdvisors,
          preloadedTerms: preloadedTermsForAdvisors,
        },
        {
          pluginManager,
          signal: context.requestSignal,
        },
      );

      const advisorSuggestions = suggestions.map((suggestion) => ({
        ...suggestion,
        advisor: pluginManager.createServiceImplementationReference(advisor),
      }));

      await cacheStore.set(cacheKey, advisorSuggestions, 60 * 60);
    });

    void Promise.all([llmTranslateTask, ...advisorTasks])
      .then(() => {
        suggestionsQueue.close();
      })
      .catch((err: unknown) => {
        logger
          .child({ component: "rpc" })
          .error("Error processing suggestions", { error: err });
        suggestionsQueue.close();
      });

    // ── Quality Sorter: collect, sort, yield ──────────────────────────
    const collector = createSuggestionCollector({
      maxWaitMs: 5000,
      minBatchMs: 2000,
    });
    const cfg = { maxWaitMs: 5000, minBatchMs: 2000 };
    const startTime = Date.now();
    let firstBatchYielded = false;
    const yielded = new Set<string>(); // dedup by translation+sourceType

    try {
      for await (const suggestion of suggestionsQueue.consume()) {
        // LLM-translate suggestions have no advisor reference; advisor suggestions do.
        const sourceType: "llm-translate" | "advisor" =
          suggestion.advisor === undefined ? "llm-translate" : "advisor";

        const key = `${suggestion.translation}\0${sourceType}`;
        if (yielded.has(key)) continue;
        yielded.add(key);

        collector.add({
          suggestion,
          sourceType,
          arrivedAt: Date.now(),
        });

        // Check if we should yield the first batch
        const elapsed = Date.now() - startTime;
        if (!firstBatchYielded && elapsed >= cfg.minBatchMs) {
          const batch = collector.yieldBatch();
          for (const item of batch) {
            yield item.suggestion;
          }
          firstBatchYielded = true;
        }
      }

      // After queue closes, yield remaining
      const remaining = collector.yieldRemaining();
      for (const item of remaining) {
        yield item.suggestion;
      }
    } finally {
      unsubscribe();
      suggestionsQueue.clear();
    }
  });
