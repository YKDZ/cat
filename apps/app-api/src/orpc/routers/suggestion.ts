import * as z from "zod/v4";
import {
  TranslationSuggestionSchema,
  type TranslationSuggestion,
} from "@cat/shared/schema/misc";
import {
  assertFirstNonNullish,
  assertSingleNonNullish,
  logger,
} from "@cat/shared/utils";
import { AsyncMessageQueue } from "@cat/app-server-shared/utils";
import { hash } from "@cat/app-server-shared/utils";
import {
  aliasedTable,
  and,
  document,
  eq,
  glossaryToProject,
  inArray,
  project,
  termEntry,
  term as termTable,
  translatableElement,
  translatableString,
} from "@cat/db";
import { authed } from "@/orpc/server";

export const onNew = authed
  .input(z.object({ elementId: z.int(), languageId: z.string() }))
  .handler(async function* ({ context, input }) {
    const {
      redisDB: { redis, redisPub, redisSub },
      drizzleDB: { client: drizzle },
      pluginRegistry,
    } = context;
    const { elementId, languageId } = input;

    const { service: termExtractor } = assertFirstNonNullish(
      pluginRegistry.getPluginServices("TERM_EXTRACTOR"),
      `No term extractor plugin found in this scope`,
    );
    const { service: termRecognizer } = assertFirstNonNullish(
      pluginRegistry.getPluginServices("TERM_RECOGNIZER"),
      `No term recognizer plugin found in this scope`,
    );

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

    const advisors = pluginRegistry
      .getPluginServices("TRANSLATION_ADVISOR")
      .map(({ service }) => service);

    const advisorAmount = advisors.length;

    if (advisorAmount === 0) {
      yield {
        from: "CAT Admin",
        value: "没有任何一个可用的翻译建议器",
        status: "ERROR",
      } satisfies TranslationSuggestion;
      return;
    }

    const processSuggestions = advisors.map(async (advisor) => {
      const elementHash = hash({
        ...element,
        targetLanguageId: languageId,
        advisorName: advisor.getName(),
      });
      const cacheKey = `cache:suggestions:${elementHash}`;

      const cachedSuggestionStrings = await redis.sMembers(cacheKey);
      const cachedSuggestion = z
        .array(TranslationSuggestionSchema)
        .parse(
          cachedSuggestionStrings.map((str) => JSON.parse(str) as unknown),
        );

      if (cachedSuggestion.length > 0) {
        // 发布缓存的值
        await Promise.all(
          cachedSuggestion.map(async (suggestion) =>
            redisPub.publish(suggestionChannelKey, JSON.stringify(suggestion)),
          ),
        );
        return;
      }

      const candidates = await termExtractor.extract(
        element.value,
        element.languageId,
      );
      const entryIds = (
        await termRecognizer.recognize(
          {
            text: element.value,
            candidates,
          },
          element.languageId,
        )
      ).map((entry) => entry.termEntryId);

      const sourceTerm = aliasedTable(termTable, "sourceTerm");
      const translationTerm = aliasedTable(termTable, "translationTerm");
      const sourceString = aliasedTable(translatableString, "sourceString");
      const translationString = aliasedTable(
        translatableString,
        "translationString",
      );
      const relations = await drizzle
        .select({
          term: sourceString.value,
          translation: translationString.value,
          subject: termEntry.subject,
        })
        .from(termEntry)
        .innerJoin(sourceTerm, eq(termEntry.id, sourceTerm.termEntryId))
        .innerJoin(
          translationTerm,
          eq(termEntry.id, translationTerm.termEntryId),
        )
        .innerJoin(sourceString, eq(sourceString.id, sourceTerm.stringId))
        .innerJoin(
          translationString,
          eq(translationString.id, translationTerm.stringId),
        )
        .where(
          and(
            inArray(termEntry.id, entryIds),
            inArray(termEntry.glossaryId, glossaryIds),
            eq(sourceString.languageId, element.languageId),
            eq(translationString.languageId, languageId),
          ),
        );

      try {
        const suggestions = await advisor.getSuggestions(
          element.value,
          relations,
          element.languageId,
          languageId,
        );

        if (suggestions.length === 0) {
          logger.warn("PLUGIN", {
            msg: `Translation advisor ${advisor.getName()} does not return any suggestions, which is not recommended. Please at least return a suggestion with error message when error occurred.`,
          });
          return;
        }

        // Publish and cache suggestions
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
      } catch (e: unknown) {
        logger.error(
          "RPC",
          { msg: "Error when generate translation suggestions" },
          e,
        );
      }
    });

    void Promise.all(processSuggestions);

    try {
      for await (const suggestion of suggestionsQueue.consume()) {
        yield suggestion;
      }
    } finally {
      await redisSub.unsubscribe(suggestionChannelKey);
      suggestionsQueue.clear();
    }
  });
