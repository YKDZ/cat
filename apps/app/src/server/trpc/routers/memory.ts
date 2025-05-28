import { AsyncMessageQueue } from "@/server/utils/queue";
import { prisma, redisSub } from "@cat/db";
import {
  MemorySchema,
  MemorySuggestion,
  MemorySuggestionSchema,
} from "@cat/shared";
import { tracked } from "@trpc/server";
import { z } from "zod/v4";
import { authedProcedure, router } from "../server";

export const memoryRouter = router({
  create: authedProcedure
    .input(
      z.object({
        name: z.string(),
        description: z.string().optional(),
        projectId: z.cuid2().optional(),
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
        sourceLanguageId: z.string(),
        translationLanguageId: z.string(),
        isApproved: z.boolean().optional(),
        translatorId: z.cuid2().optional(),
      }),
    )
    .subscription(async function* ({ input }) {
      const {
        elementId,
        sourceLanguageId,
        translationLanguageId,
        isApproved,
        translatorId,
      } = input;

      const result = await prisma.$queryRaw<
        {
          id: number;
          value: string;
          embedding: number[];
          projectId: string;
        }[]
      >`
        SELECT
          te.id AS id,
          te.value AS value,
          v.vector::real[] AS embedding,
          p.id AS "projectId"
        FROM
          "TranslatableElement" te
        JOIN
          "Vector" v ON te."embeddingId" = v.id
        JOIN
          "Document" d ON te."documentId" = d.id
        JOIN
          "Project" p ON d."projectId" = p.id
        WHERE
          te.id = ${elementId};
      `;

      // 要匹配记忆的元素
      const element = result[0];

      const memoryIds = (
        await prisma.memory.findMany({
          where: {
            Projects: {
              some: {
                id: element.projectId,
              },
            },
          },
          select: {
            id: true,
          },
        })
      ).map((memory) => memory.id);

      if (!element || memoryIds.length === 0) return;

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
      const minSimilarity = 0.72;
      const maxAmount = 3;

      prisma.$transaction(async (tx) => {
        const memories = await tx.$queryRaw<
          {
            memoryId: string;
            source: string;
            translation: string;
            creatorId: string;
            similarity: number;
          }[]
        >`
          SELECT 
            mi."memoryId",
            mi.source,
            mi.translation,
            mi."creatorId",
            1 - (v.vector <=> ${element.embedding}::vector) AS similarity
          FROM 
            "MemoryItem" mi
          JOIN
            "Vector" v ON mi."sourceEmbeddingId" = v.id
          WHERE
            mi."sourceLanguageId" = ${sourceLanguageId} AND
            mi."translationLanguageId" = ${translationLanguageId} AND
            mi."memoryId" = ANY(${memoryIds})
          ORDER BY similarity DESC
          LIMIT ${maxAmount};
        `;

        for (const {
          memoryId,
          source,
          translation,
          creatorId,
          similarity,
        } of memories) {
          if (similarity < minSimilarity) continue;

          memoriesQueue.push({
            source,
            translation,
            memoryId,
            translatorId: creatorId,
            similarity,
          });
        }
      });

      try {
        for await (const memory of memoriesQueue.consume()) {
          yield tracked(memory.memoryId, memory);
        }
      } finally {
        await redisSub.unsubscribe(memoryChannelKey);
        memoriesQueue.clear();
      }
    }),
  listUserOwned: authedProcedure
    .input(
      z.object({
        userId: z.cuid2(),
      }),
    )
    .query(async ({ input }) => {
      const { userId } = input;

      // TODO 按权限选择
      return z.array(MemorySchema).parse(
        await prisma.memory.findMany({
          where: {
            creatorId: userId,
          },
        }),
      );
    }),
  query: authedProcedure
    .input(
      z.object({
        id: z.cuid2(),
      }),
    )
    .query(async ({ input }) => {
      const { id } = input;

      return MemorySchema.nullable().parse(
        await prisma.memory.findUnique({
          where: {
            id,
          },
        }),
      );
    }),
  countMemoryItem: authedProcedure
    .input(
      z.object({
        id: z.cuid2(),
      }),
    )
    .output(z.number().int().min(0))
    .query(async ({ input }) => {
      const { id } = input;

      return await prisma.memoryItem.count({
        where: {
          Memory: {
            id,
          },
        },
      });
    }),
});
