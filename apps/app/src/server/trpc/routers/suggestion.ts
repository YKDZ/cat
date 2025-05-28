import { hash } from "@/server/utils/crypto";
import { AsyncMessageQueue } from "@/server/utils/queue";
import { prisma, redis, redisPub, redisSub } from "@cat/db";
import { TranslationAdvisorRegistry } from "@cat/plugin-core";
import {
  TranslatableElementSchema,
  TranslationSuggestion,
  TranslationSuggestionSchema,
} from "@cat/shared";
import { tracked, TRPCError } from "@trpc/server";
import { z } from "zod/v4";
import { authedProcedure, router } from "../server";

export const suggestionRouter = router({
  onNew: authedProcedure
    .input(
      z.object({
        elementId: z.number().int(),
        languageId: z.string(),
      }),
    )
    .subscription(async function* ({ input }) {
      const { elementId, languageId } = input;

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
          console.error("Invalid suggestion format: ", err);
        }
      };
      await redisSub.subscribe(suggestionChannelKey, onNewSuggestion);

      const advisorAmount =
        TranslationAdvisorRegistry.getInstance().getEnabledAdvisors().length;

      if (advisorAmount === 0) {
        yield tracked("CAT Admin", {
          from: "CAT Admin",
          value: "没有任何一个可用的翻译建议器",
          status: "ERROR",
        } satisfies TranslationSuggestion);
        return;
      }

      TranslationAdvisorRegistry.getInstance()
        .getEnabledAdvisors()
        .forEach(async (advisor) => {
          const elementHash = hash({
            ...element,
            targetLanguageId: languageId,
            advisorName: advisor.getName(),
          });
          const cacheKey = `cache:suggestions:${elementHash}`;
          const cachedSuggestion = await redis.sMembers(cacheKey);
          if (cachedSuggestion.length > 0) {
            cachedSuggestion.forEach((suggestion) => {
              redisPub.publish(suggestionChannelKey, suggestion);
            });
            return;
          }

          const zElement = TranslatableElementSchema.parse(element);
          advisor
            .getSuggestions(
              zElement,
              element.Document.Project.sourceLanguageId,
              languageId,
            )
            .then((suggestions) => {
              if (suggestions.length === 0) {
                console.error(
                  `翻译建议提供器 ${advisor.getName()} 没有返回任意一条建议，这是不推荐的行为（可能导致用户迷惑）。请在错误时也返回一条携带错误提示信息的建议。`,
                );
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
              console.error("Error when generate translation suggestions: ");
              console.error(e);
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
