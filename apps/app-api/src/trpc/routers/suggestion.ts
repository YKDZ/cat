import { tracked, TRPCError } from "@trpc/server";
import * as z from "zod/v4";
import {
  TranslationSuggestionSchema,
  type TranslationSuggestion,
} from "@cat/shared/schema/misc";
import { assertSingleNonNullish, logger } from "@cat/shared/utils";
import { AsyncMessageQueue } from "@cat/app-server-shared/utils";
import { hash } from "@cat/app-server-shared/utils";
import {
  aliasedTable,
  and,
  eq,
  inArray,
  term as termTable,
  termRelation as termRelationTable,
  translatableElement,
  translatableString,
} from "@cat/db";
import { permissionsProcedure, router } from "@/trpc/server.ts";

export const suggestionRouter = router({
  onNew: permissionsProcedure([
    {
      resourceType: "ELEMENT",
      requiredPermission: "suggestion.get",
      inputSchema: z.object({
        elementId: z.int(),
      }),
    },
    {
      resourceType: "PLUGIN",
      requiredPermission: "suggestion.get",
    },
  ])
    .input(
      z.object({
        languageId: z.string(),
      }),
    )
    .subscription(async function* ({ ctx, input }) {
      const {
        redisDB: { redis, redisPub, redisSub },
        drizzleDB: { client: drizzle },
        pluginRegistry,
      } = ctx;
      const { elementId, languageId } = input;

      // TODO 选择安装的服务或者继承
      const termService = pluginRegistry.getPluginService(
        "es-term-service",
        "TERM_SERVICE",
        "ES",
      )!;

      if (!termService) throw new Error("Term service does not exists");

      const element = assertSingleNonNullish(
        await drizzle
          .select({
            value: translatableString.value,
            languageId: translatableString.languageId,
          })
          .from(translatableElement)
          .innerJoin(
            translatableString,
            eq(translatableElement.translatableStringId, translatableString.id),
          )
          .where(eq(translatableElement.id, elementId))
          .limit(1),
      );

      if (!element) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "请求建议的元素不存在",
        });
      }

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
        yield tracked("CAT Admin", {
          from: "CAT Admin",
          value: "没有任何一个可用的翻译建议器",
          status: "ERROR",
        } satisfies TranslationSuggestion);
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
              redisPub.publish(
                suggestionChannelKey,
                JSON.stringify(suggestion),
              ),
            ),
          );
          return;
        }

        const { termedText, translationIds } =
          await termService.termStore.termText(
            element.value,
            element.languageId,
            languageId,
          );

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
          })
          .from(termRelationTable)
          .innerJoin(sourceTerm, eq(termRelationTable.termId, sourceTerm.id))
          .innerJoin(
            translationTerm,
            eq(termRelationTable.translationId, translationTerm.id),
          )
          .innerJoin(sourceString, eq(sourceString.id, sourceTerm.stringId))
          .innerJoin(
            translationString,
            eq(translationString.id, translationTerm.stringId),
          )
          .where(
            and(
              inArray(translationTerm.id, translationIds),
              eq(sourceString.languageId, element.languageId),
              eq(translationString.languageId, languageId),
            ),
          );

        try {
          const suggestions = await advisor.getSuggestions(
            element.value,
            termedText,
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

      // Start all advisor processing without waiting
      void Promise.all(processSuggestions);

      try {
        for await (const suggestion of suggestionsQueue.consume()) {
          yield tracked(suggestion.from, suggestion);
        }
      } finally {
        await redisSub.unsubscribe(suggestionChannelKey);
        suggestionsQueue.clear();
      }
    }),
});
