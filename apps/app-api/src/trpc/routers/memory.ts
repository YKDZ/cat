import { tracked } from "@trpc/server";
import * as z from "zod/v4";
import {
  MemorySuggestionSchema,
  type MemorySuggestion,
} from "@cat/shared/schema/misc";
import { logger } from "@cat/shared/utils";
import {
  MemoryItemSchema,
  MemorySchema,
} from "@cat/shared/schema/prisma/memory";
import {
  queryElementWithEmbedding,
  searchMemory,
} from "@cat/app-server-shared/utils";
import { AsyncMessageQueue } from "@cat/app-server-shared/utils";
import { UserSchema } from "@cat/shared/schema/prisma/user";
import { authedProcedure, router } from "@/trpc/server.ts";

export const memoryRouter = router({
  create: authedProcedure
    .input(
      z.object({
        name: z.string(),
        description: z.string().optional(),
        projectIds: z.array(z.ulid()).optional(),
      }),
    )
    .output(MemorySchema)
    .mutation(async ({ ctx, input }) => {
      const {
        prismaDB: { client: prisma },
        user,
      } = ctx;
      const { name, description, projectIds } = input;

      return await prisma.memory.create({
        data: {
          name,
          description,
          Creator: {
            connect: {
              id: user.id,
            },
          },
          Projects: {
            connect: projectIds
              ? projectIds.map((projectId) => ({
                  id: projectId,
                }))
              : undefined,
          },
        },
      });
    }),
  onNew: authedProcedure
    .input(
      z.object({
        elementId: z.number().int(),
        sourceLanguageId: z.string(),
        translationLanguageId: z.string(),
        minMemorySimilarity: z.number().min(0).max(1).default(0.72),
      }),
    )
    .subscription(async function* ({ ctx, input }) {
      const {
        redisDB: { redisSub },
        prismaDB: { client: prisma },
      } = ctx;
      const {
        elementId,
        sourceLanguageId,
        translationLanguageId,
        minMemorySimilarity,
      } = input;

      // 要匹配记忆的元素
      const element = await queryElementWithEmbedding(elementId);

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

      const onNewMemory = async (suggestionData: string): Promise<void> => {
        try {
          const suggestion = await MemorySuggestionSchema.parseAsync(
            JSON.parse(suggestionData),
          );
          memoriesQueue.push(suggestion);
        } catch (err) {
          logger.error(
            "PROCESSOR",
            { msg: "Invalid suggestion format: " },
            err,
          );
        }
      };
      await redisSub.subscribe(memoryChannelKey, onNewMemory);

      searchMemory(
        element.embedding,
        sourceLanguageId,
        translationLanguageId,
        memoryIds,
        minMemorySimilarity,
      ).then((memories) => memoriesQueue.push(...memories));

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
        userId: z.ulid(),
      }),
    )
    .output(z.array(MemorySchema))
    .query(async ({ ctx, input }) => {
      const {
        prismaDB: { client: prisma },
      } = ctx;
      const { userId } = input;

      // TODO 按权限选择
      return await prisma.memory.findMany({
        where: {
          creatorId: userId,
        },
      });
    }),
  get: authedProcedure
    .input(
      z.object({
        id: z.ulid(),
      }),
    )
    .output(
      MemorySchema.extend({
        Creator: UserSchema,
      }).nullable(),
    )
    .query(async ({ ctx, input }) => {
      const {
        prismaDB: { client: prisma },
      } = ctx;
      const { id } = input;

      return await prisma.memory.findUnique({
        where: {
          id,
        },
        include: {
          Creator: true,
        },
      });
    }),
  countMemoryItem: authedProcedure
    .input(
      z.object({
        id: z.ulid(),
      }),
    )
    .output(z.number().int().min(0))
    .query(async ({ ctx, input }) => {
      const {
        prismaDB: { client: prisma },
      } = ctx;
      const { id } = input;

      return await prisma.memoryItem.count({
        where: {
          Memory: {
            id,
          },
        },
      });
    }),
  queryItems: authedProcedure
    .input(
      z.object({
        memoryId: z.ulid(),
        sourceLanguageId: z.string().nullable(),
        translationLanguageId: z.string().nullable(),
      }),
    )
    .output(z.array(MemoryItemSchema))
    .query(async ({ ctx, input }) => {
      const {
        prismaDB: { client: prisma },
      } = ctx;
      const { memoryId, sourceLanguageId, translationLanguageId } = input;

      const items = await prisma.memoryItem.findMany({
        where: {
          sourceLanguageId: sourceLanguageId ?? undefined,
          translationLanguageId: translationLanguageId ?? undefined,
          memoryId,
        },
      });

      return items;
    }),
  deleteItems: authedProcedure
    .input(
      z.object({
        ids: z.array(z.int()),
      }),
    )
    .output(z.void())
    .mutation(async ({ ctx, input }) => {
      const {
        prismaDB: { client: prisma },
      } = ctx;
      const { ids } = input;

      await prisma.memoryItem.deleteMany({
        where: {
          id: {
            in: ids,
          },
        },
      });
    }),
  listProjectOwned: authedProcedure
    .input(
      z.object({
        projectId: z.ulid(),
      }),
    )
    .output(z.array(MemorySchema))
    .query(async ({ ctx, input }) => {
      const {
        prismaDB: { client: prisma },
      } = ctx;
      const { projectId } = input;

      return await prisma.memory.findMany({
        where: {
          Projects: {
            some: {
              id: projectId,
            },
          },
        },
        include: {
          Creator: true,
        },
      });
    }),
  countItem: authedProcedure
    .input(
      z.object({
        id: z.ulid(),
      }),
    )
    .output(z.number().int())
    .query(async ({ ctx, input }) => {
      const {
        prismaDB: { client: prisma },
      } = ctx;
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
