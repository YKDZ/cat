import { fetchAdviseWorkflow, getWorkflowRuntime } from "@cat/agent/workflow";
import {
  executeQuery,
  getElementWithChunkIds,
  listProjectGlossaryIds,
} from "@cat/domain";
import { AsyncMessageQueue, hash } from "@cat/server-shared";
import { serverLogger as logger } from "@cat/server-shared";
import {
  TranslationSuggestionSchema,
  type TranslationSuggestion,
} from "@cat/shared/schema/plugin";
import * as z from "zod/v4";

import { authed } from "@/orpc/server";

export const onNew = authed
  .input(z.object({ elementId: z.int(), languageId: z.string() }))
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

    const element = await executeQuery(
      { db: drizzle },
      getElementWithChunkIds,
      { elementId },
    );

    if (element === null) {
      throw new Error(`Element with ID ${elementId} not found`);
    }

    const glossaryIds = await executeQuery(
      { db: drizzle },
      listProjectGlossaryIds,
      { projectId: element.projectId },
    );

    const suggestionsQueue = new AsyncMessageQueue<TranslationSuggestion>();
    const unsubscribe = getWorkflowRuntime().eventBus.subscribe(
      "workflow:suggestion:ready",
      async (event) => {
        const parsed = await SuggestionEventPayloadSchema.safeParseAsync(
          event.payload,
        );
        if (!parsed.success) {
          logger
            .withSituation("RPC")
            .error({ msg: "Invalid suggestion format" }, parsed.error);
          return;
        }

        if (parsed.data.elementId !== elementId) {
          return;
        }

        suggestionsQueue.push(parsed.data.suggestion);
      },
    );

    const advisors = pluginManager.getServices("TRANSLATION_ADVISOR");

    const advisorAmount = advisors.length;

    if (advisorAmount === 0) {
      return;
    }

    // TODO 复用建议工作流
    const processSuggestions = advisors.map(async (advisor) => {
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

      const { result } = await fetchAdviseWorkflow.run(
        {
          text: element.value,
          glossaryIds,
          advisorId: advisor.dbId,
          sourceLanguageId: element.languageId,
          translationLanguageId: languageId,
          eventElementId: elementId,
          eventAdvisorId: advisor.dbId,
        },
        {
          pluginManager,
        },
      );

      const { suggestions } = await result();

      const advisorSuggestions = suggestions.map((suggestion) => ({
        ...suggestion,
        advisorId: advisor.dbId,
      }));

      await cacheStore.set(cacheKey, advisorSuggestions, 60 * 60);
    });

    void Promise.all(processSuggestions)
      .then(() => {
        suggestionsQueue.close();
      })
      .catch((err: unknown) => {
        logger
          .withSituation("RPC")
          .error({ msg: "Error processing suggestions" }, err);
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
