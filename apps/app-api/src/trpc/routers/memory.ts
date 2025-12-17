import { tracked, TRPCError } from "@trpc/server";
import * as z from "zod/v4";
import {
  MemorySuggestionSchema,
  type MemorySuggestion,
} from "@cat/shared/schema/misc";
import {
  assertFirstNonNullish,
  assertSingleNonNullish,
  assertSingleOrNull,
  logger,
} from "@cat/shared/utils";
import { MemorySchema } from "@cat/shared/schema/drizzle/memory";
import { searchMemory } from "@cat/app-server-shared/utils";
import { AsyncMessageQueue } from "@cat/app-server-shared/utils";
import {
  chunk,
  chunkSet,
  count,
  document as documentTable,
  eq,
  getColumns,
  memoryItem as memoryItemTable,
  memory as memoryTable,
  memoryToProject,
  sql,
  translatableElement,
  translatableString,
} from "@cat/db";
import { permissionProcedure, router } from "@/trpc/server.ts";

export const memoryRouter = router({
  create: permissionProcedure("GLOSSARY", "create")
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
  onNew: permissionProcedure(
    "ELEMENT",
    "find-memory",
    z.object({
      elementId: z.int(),
    }),
  )
    .input(
      z.object({
        translationLanguageId: z.string(),
        minMemorySimilarity: z.number().min(0).max(1).default(0.72),
      }),
    )
    .subscription(async function* ({ ctx, input }) {
      const {
        redisDB: { redisSub },
        drizzleDB: { client: drizzle },
        pluginRegistry,
      } = ctx;
      const { elementId, translationLanguageId, minMemorySimilarity } = input;

      // TODO 配置
      const vectorStorage = assertFirstNonNullish(
        pluginRegistry.getPluginServices("VECTOR_STORAGE"),
      );

      // 要匹配记忆的元素
      const element = assertSingleNonNullish(
        await drizzle
          .select({
            id: translatableElement.id,
            value: translatableString.value,
            languageId: translatableString.languageId,
            projectId: documentTable.projectId,
            chunkIds: sql<
              number[]
            >`coalesce(array_agg("Chunk"."id"), ARRAY[]::int[])`,
          })
          .from(translatableElement)
          .innerJoin(
            translatableString,
            eq(translatableElement.translatableStringId, translatableString.id),
          )
          .innerJoin(
            documentTable,
            eq(translatableElement.documentId, documentTable.id),
          )
          .innerJoin(chunkSet, eq(translatableString.chunkSetId, chunkSet.id))
          .leftJoin(chunk, eq(chunk.chunkSetId, chunkSet.id))
          .where(eq(translatableElement.id, elementId))
          .groupBy(
            translatableElement.id,
            translatableString.value,
            translatableString.languageId,
            documentTable.projectId,
          ),
      );

      const chunks = await vectorStorage.service.retrieve(element.chunkIds);

      if (!chunks)
        throw new TRPCError({
          code: "SERVICE_UNAVAILABLE",
          message: `Failed to retrieve chunks`,
        });

      const embeddings = chunks.map((chunk) => chunk.vector);

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
          vectorStorage.service,
          embeddings,
          element.languageId,
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
  getUserOwned: permissionProcedure("MEMORY", "get.user-owned.others")
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

      return await drizzle
        .select(getColumns(memoryTable))
        .from(memoryTable)
        .where(eq(memoryTable.creatorId, userId));
    }),
  get: permissionProcedure(
    "MEMORY",
    "get.others",
    z.object({
      memoryId: z.uuidv7(),
    }),
  )
    .output(MemorySchema.nullable())
    .query(async ({ ctx, input }) => {
      const {
        drizzleDB: { client: drizzle },
      } = ctx;
      const { memoryId } = input;

      return assertSingleOrNull(
        await drizzle
          .select()
          .from(memoryTable)
          .where(eq(memoryTable.id, memoryId)),
      );
    }),
  getProjectOwned: permissionProcedure("MEMORY", "get.project-owned.others")
    .input(
      z.object({
        projectId: z.uuidv7(),
      }),
    )
    .output(z.array(MemorySchema))
    .query(async ({ ctx, input }) => {
      const {
        drizzleDB: { client: drizzle },
      } = ctx;
      const { projectId } = input;

      return await drizzle
        .select(getColumns(memoryTable))
        .from(memoryToProject)
        .innerJoin(
          memoryToProject,
          eq(memoryToProject.memoryId, memoryTable.id),
        )
        .where(eq(memoryToProject.projectId, projectId));
    }),
  countItem: permissionProcedure(
    "MEMORY",
    "count.item",
    z.object({
      memoryId: z.uuidv7(),
    }),
  )
    .output(z.number().int())
    .query(async ({ ctx, input }) => {
      const {
        drizzleDB: { client: drizzle },
      } = ctx;
      const { memoryId } = input;

      return assertSingleNonNullish(
        await drizzle
          .select({ count: count() })
          .from(memoryItemTable)
          .where(eq(memoryItemTable.memoryId, memoryId))
          .limit(1),
      ).count;
    }),
});
