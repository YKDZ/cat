import { z } from "zod";
import { authedProcedure, router } from "../server";
import { prisma } from "@cat/db";
import { AsyncMessageQueue } from "@/server/utils/queue";
import { MemorySuggestion, MemorySuggestionSchema } from "@cat/shared";
import { redisSub } from "@/server/database/redis";
import { tracked } from "@trpc/server";

export const memoryRouter = router({
  create: authedProcedure
    .input(
      z.object({
        name: z.string(),
        description: z.string().optional(),
        projectId: z.string().cuid2().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { user } = ctx;
      const { name, description, projectId } = input;

      await prisma.memory.create({
        data: {
          name,
          description,
          Creator: {
            connect: {
              id: user.id,
            },
          },
          Projects: projectId
            ? {
                connect: {
                  id: projectId,
                },
              }
            : undefined,
        },
      });
    }),
  onNew: authedProcedure
    .input(
      z.object({
        elementId: z.number().int(),
        languageId: z.string(),
        isApproved: z.boolean().optional(),
        translatorId: z.string().cuid2().optional(),
      }),
    )
    .subscription(async function* ({ input }) {
      const { elementId, languageId, isApproved, translatorId } = input;

      const result = (await prisma.$queryRaw`
        SELECT
          te.id AS id,
          te.value AS value,
          te.embedding::real[] AS embedding,
          p.id AS "projectId"
        FROM
          "TranslatableElement" te
        JOIN
          "Document" d ON te."documentId" = d.id
        JOIN
          "Project" p ON d."projectId" = p.id
        WHERE
          te.id = ${elementId};
      `) as {
        id: number;
        value: string;
        embedding: number[];
        projectId: string;
      }[];

      // 要匹配记忆的元素
      const element = result[0];

      const memories = await prisma.memory.findMany({
        where: {
          Projects: {
            some: {
              id: element.projectId,
            },
          },
        },
      });

      if (!element || memories.length === 0) return;

      const memoriesQueue = new AsyncMessageQueue<MemorySuggestion>();
      const memoryChannelKey = `memories:channel:${elementId}`;

      const onNewMemory = async (suggestionData: string) => {
        try {
          const suggestion = await MemorySuggestionSchema.parseAsync(
            JSON.parse(suggestionData),
          );
          memoriesQueue.push(suggestion);
        } catch (err) {
          console.error("Invalid suggestion format: ", err);
        }
      };
      await redisSub.subscribe(memoryChannelKey, onNewMemory);

      // 开始查找记忆
      const minSimilarity = 0.85;
      const maxAmount = 3;
      prisma.$transaction(async (tx) => {
        const allPossibleElementIds = (
          await tx.translatableElement.findMany({
            where: {
              id: {
                not: elementId,
              },
              Document: {
                Project: {
                  sourceLanguageId: languageId,
                },
              },
              Translations: {
                some: {
                  isApproved,
                  translatorId,
                },
              },
            },
          })
        ).map((element) => element.id);

        const data = (await tx.$queryRawUnsafe(`
          SELECT 
            id,
            value,
            1 - (embedding <=> '[${element.embedding.join(",")}]') AS similarity
          FROM "TranslatableElement"
          WHERE id IN (${allPossibleElementIds.join(",")})
          ORDER BY similarity ASC
          LIMIT ${maxAmount};
        `)) as {
          id: number;
          value: string;
          similarity: number;
        }[];

        for (const { id, value, similarity } of data) {
          if (similarity < minSimilarity) continue;

          const items = await tx.memoryItem.findMany({
            where: {
              sourceElementId: id,
              Memory: {
                id: {
                  in: memories.map((memory) => memory.id),
                },
              },
            },
            include: {
              Translation: true,
              Memory: true,
            },
          });

          for (const item of items) {
            memoriesQueue.push({
              source: value,
              translation: item.Translation.value,
              memoryId: item.Memory.id,
              translatorId: item.Translation.translatorId,
              similarity,
            });
          }
        }
      });

      try {
        for await (const memory of memoriesQueue.consume()) {
          yield tracked(`${memory.memoryId}`, memory);
        }
      } finally {
        await redisSub.unsubscribe(memoryChannelKey);
        memoriesQueue.clear();
      }
    }),
});
