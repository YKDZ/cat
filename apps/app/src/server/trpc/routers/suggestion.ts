import { tracked, TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  TranslationSuggestionSchema,
  type TranslationSuggestion,
} from "@cat/shared/schema/misc";
import { TranslatableElementSchema } from "@cat/shared/schema/prisma/document";
import { logger } from "@cat/shared/utils";
import { authedProcedure, router } from "@/server/trpc/server.ts";
import { AsyncMessageQueue } from "@/server/utils/queue.ts";
import { hash } from "@/server/utils/crypto.ts";

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
        prismaDB: { client: prisma },
        pluginRegistry,
      } = ctx;
      const { elementId, languageId } = input;

      // TODO 选择安装的服务或者继承
      const { service: termService } = (await pluginRegistry.getPluginService(
        prisma,
        "es-term-service",
        "TERM_SERVICE",
        "ES",
      ))!;

      if (!termService) throw new Error("Term service does not exists");

      const element = await prisma.translatableElement.findUnique({
        where: {
          id: elementId,
        },
        include: {
          Document: {
            include: {
              Project: true,
            },
          },
        },
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
        await pluginRegistry.getPluginServices(prisma, "TRANSLATION_ADVISOR")
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
            element.Document!.Project.sourceLanguageId,
            languageId,
          );
        const relations = await prisma.termRelation.findMany({
          where: {
            translationId: {
              in: translationIds,
            },
            Term: {
              languageId: element.Document!.Project.sourceLanguageId,
            },
            Translation: {
              languageId,
            },
          },
          include: {
            Term: true,
            Translation: true,
          },
        });
        advisor
          .getSuggestions(
            zElement,
            termedText,
            relations,
            element.Document!.Project.sourceLanguageId,
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
