import { tracked } from "@trpc/server";
import * as z from "zod/v4";
import {
  MemorySuggestionSchema,
  type MemorySuggestion,
} from "@cat/shared/schema/misc";
import { assertSingleNonNullish, logger } from "@cat/shared/utils";
import {
  MemoryItemSchema,
  MemorySchema,
} from "@cat/shared/schema/drizzle/memory";
import { searchMemory } from "@cat/app-server-shared/utils";
import { AsyncMessageQueue } from "@cat/app-server-shared/utils";
import { UserSchema } from "@cat/shared/schema/drizzle/user";
import {
  count,
  document as documentTable,
  eq,
  inArray,
  memoryItem as memoryItemTable,
  memory as memoryTable,
  memoryToProject,
  translatableElement,
  translatableString,
  vector,
} from "@cat/db";
import { authedProcedure, router } from "@/trpc/server.ts";

export const memoryRouter = router({
  create: authedProcedure
    .input(
      z.object({
        name: z.string(),
        description: z.string().optional(),
        projectIds: z.array(z.uuidv7()).optional(),
      }),
    )
    .output(MemorySchema)
    .mutation(async ({ ctx, input }) => {
      const {
        drizzleDB: { client: drizzle },
        user,
      } = ctx;
      const { name, description, projectIds } = input;

      return await drizzle.transaction(async (tx) => {
        const memory = assertSingleNonNullish(
          await tx
            .insert(memoryTable)
            .values({
              name,
              description,
              creatorId: user.id,
            })
            .returning(),
        );

        if (projectIds && projectIds.length > 0)
          await tx.insert(memoryToProject).values(
            projectIds.map((projectId) => ({
              memoryId: memory.id,
              projectId,
            })),
          );

        return memory;
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
        drizzleDB: { client: drizzle },
      } = ctx;
      const {
        elementId,
        sourceLanguageId,
        translationLanguageId,
        minMemorySimilarity,
      } = input;

      // 要匹配记忆的元素
      const element = assertSingleNonNullish(
        await drizzle
          .select({
            id: translatableElement.id,
            value: translatableString.value,
            embedding: vector.vector,
            projectId: documentTable.projectId,
          })
          .from(translatableElement)
          .innerJoin(
            translatableString,
            eq(translatableElement.translableStringId, translatableString.id),
          )
          .innerJoin(vector, eq(translatableString.embeddingId, vector.id))
          .innerJoin(
            documentTable,
            eq(translatableElement.documentId, documentTable.id),
          )
          .where(eq(translatableElement.id, elementId))
          .limit(1),
      );

      const memoryIds = (
        await drizzle
          .select({
            memoryId: memoryToProject.memoryId,
          })
          .from(memoryToProject)
          .where(eq(memoryToProject.projectId, element.projectId))
      ).map((row) => row.memoryId);

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

      memoriesQueue.push(
        ...(await searchMemory(
          drizzle,
          element.embedding,
          sourceLanguageId,
          translationLanguageId,
          memoryIds,
          minMemorySimilarity,
        )),
      );

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
        userId: z.uuidv7(),
      }),
    )
    .output(z.array(MemorySchema))
    .query(async ({ ctx, input }) => {
      const {
        drizzleDB: { client: drizzle },
      } = ctx;
      const { userId } = input;

      // TODO 按权限选择
      return await drizzle.query.memory.findMany({
        where: (memory, { eq }) => eq(memory.creatorId, userId),
      });
    }),
  get: authedProcedure
    .input(
      z.object({
        id: z.uuidv7(),
      }),
    )
    .output(
      MemorySchema.extend({
        Creator: UserSchema,
      }).nullable(),
    )
    .query(async ({ ctx, input }) => {
      const {
        drizzleDB: { client: drizzle },
      } = ctx;
      const { id } = input;

      return (
        (await drizzle.query.memory.findFirst({
          where: (memory, { eq }) => eq(memory.id, id),
          with: {
            Creator: true,
          },
        })) ?? null
      );
    }),
  countMemoryItem: authedProcedure
    .input(
      z.object({
        id: z.uuidv7(),
      }),
    )
    .output(z.number().int().min(0))
    .query(async ({ ctx, input }) => {
      const {
        drizzleDB: { client: drizzle },
      } = ctx;
      const { id } = input;

      return assertSingleNonNullish(
        await drizzle
          .select({ count: count() })
          .from(memoryItemTable)
          .where(eq(memoryItemTable.memoryId, id))
          .limit(1),
      ).count;
    }),
  queryItems: authedProcedure
    .input(
      z.object({
        memoryId: z.uuidv7(),
        sourceLanguageId: z.string().nullable(),
        translationLanguageId: z.string().nullable(),
      }),
    )
    .output(z.array(MemoryItemSchema))
    .query(async ({ ctx, input }) => {
      const {
        drizzleDB: { client: drizzle },
      } = ctx;
      const { memoryId, sourceLanguageId, translationLanguageId } = input;

      const items = await drizzle.query.memoryItem.findMany({
        where: (memoryItem, { eq, and }) =>
          and(
            eq(memoryItem.memoryId, memoryId),
            sourceLanguageId
              ? eq(memoryItem.sourceLanguageId, sourceLanguageId)
              : undefined,
            translationLanguageId
              ? eq(memoryItem.translationLanguageId, translationLanguageId)
              : undefined,
          ),
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
        drizzleDB: { client: drizzle },
      } = ctx;
      const { ids } = input;

      await drizzle
        .delete(memoryItemTable)
        .where(inArray(memoryItemTable.id, ids));
    }),
  listProjectOwned: authedProcedure
    .input(
      z.object({
        projectId: z.uuidv7(),
      }),
    )
    .output(
      z.array(
        MemorySchema.extend({
          Creator: UserSchema,
        }),
      ),
    )
    .query(async ({ ctx, input }) => {
      const {
        drizzleDB: { client: drizzle },
      } = ctx;
      const { projectId } = input;

      const row = await drizzle.query.memoryToProject.findMany({
        where: (memoryToProject, { eq }) =>
          eq(memoryToProject.projectId, projectId),
        with: {
          Memory: {
            with: {
              Creator: true,
            },
          },
        },
      });

      return row.map((r) => r.Memory);
    }),
  countItem: authedProcedure
    .input(
      z.object({
        id: z.uuidv7(),
      }),
    )
    .output(z.number().int())
    .query(async ({ ctx, input }) => {
      const {
        drizzleDB: { client: drizzle },
      } = ctx;
      const { id } = input;

      return assertSingleNonNullish(
        await drizzle
          .select({ count: count() })
          .from(memoryItemTable)
          .where(eq(memoryItemTable.memoryId, id))
          .limit(1),
      ).count;
    }),
});
