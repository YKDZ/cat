import { tracked, TRPCError } from "@trpc/server";
import * as z from "zod/v4";
import {
  TranslationSuggestionSchema,
  type TranslationSuggestion,
} from "@cat/shared/schema/misc";
import { TranslatableElementSchema } from "@cat/shared/schema/drizzle/document";
import { logger } from "@cat/shared/utils";
import { AsyncMessageQueue } from "@cat/app-server-shared/utils";
import { hash } from "@cat/app-server-shared/utils";
import {
  aliasedTable,
  and,
  eq,
  inArray,
  term as termTable,
  termRelation as termRelationTable,
  getTableColumns,
} from "@cat/db";
import { authedProcedure, router } from "@/trpc/server.ts";

export const suggestionRouter = router({
  onNew: authedProcedure
    .input(
      z.object({
        elementId: z.number().int(),
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
      const { service: termService } = (await pluginRegistry.getPluginService(
        drizzle,
        "es-term-service",
        "TERM_SERVICE",
        "ES",
      ))!;

      if (!termService) throw new Error("Term service does not exists");

      const element = await drizzle.query.translatableElement.findFirst({
        where: (el, { eq }) => eq(el.id, elementId),
      });

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

      const advisors = (
        await pluginRegistry.getPluginServices(drizzle, "TRANSLATION_ADVISOR")
      ).map(({ service }) => service);

      const advisorAmount = advisors.length;

      if (advisorAmount === 0) {
        yield tracked("CAT Admin", {
          from: "CAT Admin",
          value: "没有任何一个可用的翻译建议器",
          status: "ERROR",
        } satisfies TranslationSuggestion);
        return;
      }

      advisors.forEach(async (advisor) => {
        const elementHash = hash({
          ...element,
          targetLanguageId: languageId,
          advisorName: advisor.getName(),
        });
        const cacheKey = `cache:suggestions:${elementHash}`;
        const cachedSuggestion = z
          .array(TranslationSuggestionSchema)
          .parse(
            (await redis.sMembers(cacheKey)).map((str) => JSON.parse(str)),
          );
        if (cachedSuggestion.length > 0) {
          cachedSuggestion.forEach((suggestion) => {
            redisPub.publish(suggestionChannelKey, JSON.stringify(suggestion));
          });
          return;
        }

        const zElement = TranslatableElementSchema.parse(element);
        const { termedText, translationIds } =
          await termService.termStore.termText(
            zElement.value,
            "zh_Hans",
            languageId,
          );
        const relationTerm = aliasedTable(termTable, "relationTerm");
        const relationTranslation = aliasedTable(
          termTable,
          "relationTranslation",
        );
        const relations = await drizzle
          .select({
            ...getTableColumns(termRelationTable),
            Term: getTableColumns(relationTerm),
            Translation: getTableColumns(relationTranslation),
          })
          .from(termRelationTable)
          .innerJoin(
            relationTerm,
            eq(termRelationTable.termId, relationTerm.id),
          )
          .innerJoin(
            relationTranslation,
            eq(termRelationTable.translationId, relationTranslation.id),
          )
          .where(
            and(
              inArray(relationTranslation.id, translationIds),
              eq(relationTerm.languageId, "zh_Hans"),
              eq(relationTranslation.languageId, languageId),
            ),
          );
        advisor
          .getSuggestions(
            zElement.value,
            termedText,
            relations,
            "zh_Hans",
            languageId,
          )
          .then((suggestions) => {
            if (suggestions.length === 0) {
              logger.warn("PLUGIN", {
                msg: `Translation advisor ${advisor.getName()} does not return any suggestions, which is not recommended. Please at least return a suggestion with error message when error occurred.`,
              });
              return;
            }
            suggestions.forEach((suggestion) => {
              const suggestionStr = JSON.stringify(suggestion);
              redisPub.publish(suggestionChannelKey, suggestionStr);
              // 缓存结果
              if (suggestion.status === "SUCCESS") {
                redis.sAdd(cacheKey, suggestionStr);
                redis.expire(cacheKey, 60 * 60);
              }
            });
          })
          .catch((e) => {
            logger.error(
              "RPC",
              { msg: "Error when generate translation suggestions" },
              e,
            );
          });
      });

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
