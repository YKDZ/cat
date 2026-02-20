import * as z from "zod/v4";
import {
  TranslationSuggestionSchema,
  type TranslationSuggestion,
} from "@cat/shared/schema/misc";
import { assertSingleNonNullish, logger } from "@cat/shared/utils";
import { AsyncMessageQueue, hash } from "@cat/app-server-shared/utils";
import {
  document,
  eq,
  glossaryToProject,
  pluginInstallation,
  pluginService,
  project,
  translatableElement,
  translatableString,
} from "@cat/db";
import { authed } from "@/orpc/server";
import { fetchAdviseWorkflow } from "@cat/app-workers";

export const onNew = authed
  .input(z.object({ elementId: z.int(), languageId: z.string() }))
  .handler(async function* ({ context, input }) {
    const {
      redisDB: { redis, redisPub, redisSub },
      drizzleDB: { client: drizzle },
      pluginManager,
    } = context;
    const { elementId, languageId } = input;

    const element = assertSingleNonNullish(
      await drizzle
        .select({
          value: translatableString.value,
          languageId: translatableString.languageId,
          projectId: project.id,
        })
        .from(translatableElement)
        .innerJoin(
          translatableString,
          eq(translatableElement.translatableStringId, translatableString.id),
        )
        .innerJoin(document, eq(document.id, translatableElement.documentId))
        .innerJoin(project, eq(project.id, document.projectId))
        .where(eq(translatableElement.id, elementId))
        .limit(1),
      `Element with ID ${elementId} not found`,
    );

    const glossaryIds = (
      await drizzle
        .select({
          id: glossaryToProject.glossaryId,
        })
        .from(glossaryToProject)
        .where(eq(glossaryToProject.projectId, element.projectId))
    ).map((item) => item.id);

    const suggestionsQueue = new AsyncMessageQueue<TranslationSuggestion>();
    const suggestionChannelKey = `suggestions:channel:${elementId}`;

    const onNewSuggestion = async (suggestionData: string) => {
      try {
        const suggestion = await TranslationSuggestionSchema.parseAsync(
          JSON.parse(suggestionData),
        );
        suggestionsQueue.push(suggestion);
      } catch (err) {
        logger.error("RPC", { msg: "Invalid suggestion format: " }, err);
      }
    };
    await redisSub.subscribe(suggestionChannelKey, onNewSuggestion);

    const advisors = pluginManager.getServices("TRANSLATION_ADVISOR");

    const advisorAmount = advisors.length;

    if (advisorAmount === 0) {
      yield {
        from: "CAT Admin",
        value: "没有任何一个可用的翻译建议器",
        status: "ERROR",
      } satisfies TranslationSuggestion;
      return;
    }

    // TODO 复用建议工作流
    const processSuggestions = advisors.map(async (advisor) => {
      const service = assertSingleNonNullish(
        await drizzle
          .select({
            id: pluginService.id,
          })
          .from(pluginService)
          .innerJoin(
            pluginInstallation,
            eq(pluginInstallation.id, pluginService.pluginInstallationId),
          )
          .where(eq(pluginService.id, advisor.dbId)),
      );

      const elementHash = hash({
        ...element,
        targetLanguageId: languageId,
        advisorId: service.id,
      });
      const cacheKey = `cache:suggestions:${elementHash}`;

      const cachedSuggestions = await redis.sMembers(cacheKey);
      if (cachedSuggestions.length > 0) {
        for (const s of cachedSuggestions) {
          suggestionsQueue.push(
            TranslationSuggestionSchema.parse(JSON.parse(s)),
          );
        }
        return;
      }

      const { result } = await fetchAdviseWorkflow.run({
        text: element.value,
        glossaryIds,
        advisorId: service.id,
        sourceLanguageId: element.languageId,
        translationLanguageId: languageId,
      });

      const { suggestions } = await result();

      await Promise.all(
        suggestions.map(async (suggestion) => {
          const suggestionStr = JSON.stringify(suggestion);
          await redisPub.publish(suggestionChannelKey, suggestionStr);

          // Cache successful suggestions
          if (suggestion.status === "SUCCESS") {
            await redis.sAdd(cacheKey, suggestionStr);
            await redis.expire(cacheKey, 60 * 60);
          }
        }),
      );
    });

    void Promise.all(processSuggestions)
      .then(() => {
        suggestionsQueue.close();
      })
      .catch((err: unknown) => {
        logger.error("RPC", { msg: "Error processing suggestions" }, err);
        suggestionsQueue.close();
      });

    try {
      for await (const suggestion of suggestionsQueue.consume()) {
        yield suggestion;
      }
    } finally {
      await redisSub.unsubscribe(suggestionChannelKey);
      suggestionsQueue.clear();
    }
  });
