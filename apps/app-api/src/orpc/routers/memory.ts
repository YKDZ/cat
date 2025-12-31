import * as z from "zod/v4";
import {
  MemorySuggestionSchema,
  type MemorySuggestion,
} from "@cat/shared/schema/misc";
import {
  assertSingleNonNullish,
  assertSingleOrNull,
  logger,
} from "@cat/shared/utils";
import { MemorySchema } from "@cat/shared/schema/drizzle/memory";
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
import { authed } from "@/orpc/server";
import { searchMemoryWorkflow } from "@cat/app-workers";

export const create = authed
  .input(
    z.object({
      name: z.string(),
      description: z.string().optional(),
      projectIds: z.array(z.uuidv4()).optional(),
    }),
  )
  .output(MemorySchema)
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: drizzle },
      user,
    } = context;
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
  });

export const onNew = authed
  .input(
    z.object({
      elementId: z.int(),
      translationLanguageId: z.string(),
      minMemorySimilarity: z.number().min(0).max(1).default(0.72),
    }),
  )
  .handler(async function* ({ context, input }) {
    const {
      redisDB: { redisSub },
      drizzleDB: { client: drizzle },
    } = context;
    const { elementId, translationLanguageId, minMemorySimilarity } = input;

    // 要匹配记忆的元素
    const element = assertSingleNonNullish(
      await drizzle
        .select({
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
        logger.error("PROCESSOR", { msg: "Invalid suggestion format: " }, err);
      }
    };
    await redisSub.subscribe(memoryChannelKey, onNewMemory);

    const { result } = await searchMemoryWorkflow.run({
      chunkIds: element.chunkIds,
      memoryIds,
      sourceLanguageId: element.languageId,
      translationLanguageId,
      minSimilarity: minMemorySimilarity,
    });

    memoriesQueue.push(...(await result()).memories);

    try {
      for await (const memory of memoriesQueue.consume()) {
        yield memory;
      }
    } finally {
      await redisSub.unsubscribe(memoryChannelKey);
      memoriesQueue.clear();
    }
  });

export const getUserOwned = authed
  .input(
    z.object({
      userId: z.uuidv4(),
    }),
  )
  .output(z.array(MemorySchema))
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: drizzle },
    } = context;
    const { userId } = input;

    return await drizzle
      .select(getColumns(memoryTable))
      .from(memoryTable)
      .where(eq(memoryTable.creatorId, userId));
  });

export const get = authed
  .input(
    z.object({
      memoryId: z.uuidv4(),
    }),
  )
  .output(MemorySchema.nullable())
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: drizzle },
    } = context;
    const { memoryId } = input;

    return assertSingleOrNull(
      await drizzle
        .select()
        .from(memoryTable)
        .where(eq(memoryTable.id, memoryId)),
    );
  });

export const getProjectOwned = authed
  .input(
    z.object({
      projectId: z.uuidv4(),
    }),
  )
  .output(z.array(MemorySchema))
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: drizzle },
    } = context;
    const { projectId } = input;

    return await drizzle
      .select(getColumns(memoryTable))
      .from(memoryToProject)
      .innerJoin(memoryToProject, eq(memoryToProject.memoryId, memoryTable.id))
      .where(eq(memoryToProject.projectId, projectId));
  });
export const countItem = authed
  .input(
    z.object({
      memoryId: z.uuidv4(),
    }),
  )
  .output(z.int())
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: drizzle },
    } = context;
    const { memoryId } = input;

    return assertSingleNonNullish(
      await drizzle
        .select({ count: count() })
        .from(memoryItemTable)
        .where(eq(memoryItemTable.memoryId, memoryId))
        .limit(1),
    ).count;
  });
