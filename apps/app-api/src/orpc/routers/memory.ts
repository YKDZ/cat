import type { TranslationSuggestion } from "@cat/shared/schema/plugin";

import {
  adaptMemoryOp,
  streamSearchMemoryOp,
} from "@cat/operations";
import { AsyncMessageQueue } from "@cat/server-shared";
import {
  countMemoryItems,
  createMemory as createMemoryCommand,
  executeCommand,
  executeQuery,
  getElementWithChunkIds,
  getMemory,
  listMemoryIdsByProject,
  listOwnedMemories,
  listProjectMemories,
} from "@cat/domain";
import { MemorySchema } from "@cat/shared/schema/drizzle/memory";
import {
  MemorySuggestionSchema,
  type MemorySuggestion,
} from "@cat/shared/schema/misc";
import { logger } from "@cat/shared/utils";
import * as z from "zod/v4";

import { authed } from "@/orpc/server";

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

    return await drizzle.transaction(async (tx) => {
      return executeCommand({ db: tx }, createMemoryCommand, {
        ...input,
        creatorId: user.id,
      });
    });
  });

export const onNew = authed
  .input(
    z.object({
      elementId: z.int(),
      translationLanguageId: z.string(),
      minConfidence: z.number().min(0).max(1).default(0.72),
      maxAmount: z.int().min(0).default(3),
    }),
  )
  .handler(async function* ({ context, input }) {
    const {
      redisDB: { redisSub, redisPub },
      drizzleDB: { client: drizzle },
    } = context;
    const { elementId, translationLanguageId, minConfidence, maxAmount } =
      input;

    // Fetch element details — text, language, project, and chunk IDs
    const element = await executeQuery(
      { db: drizzle },
      getElementWithChunkIds,
      { elementId },
    );

    if (!element) {
      throw new Error(`Element ${elementId} not found`);
    }

    const memoryIds = await executeQuery(
      { db: drizzle },
      listMemoryIdsByProject,
      { projectId: element.projectId },
    );

    if (!element || memoryIds.length === 0) return;

    // Subscribe to Redis for any externally-published memory suggestions
    const memoriesQueue = new AsyncMessageQueue<MemorySuggestion>();
    const memoryChannelKey = `memories:channel:${elementId}`;

    const onNewMemory = async (suggestionData: string): Promise<void> => {
      try {
        const suggestion = await MemorySuggestionSchema.parseAsync(
          JSON.parse(suggestionData),
        );
        memoriesQueue.push(suggestion);
      } catch (err) {
        logger.error("WORKER", { msg: "Invalid suggestion format: " }, err);
      }
    };
    await redisSub.subscribe(memoryChannelKey, onNewMemory);

    // Use three-channel streaming search
    const stream = streamSearchMemoryOp({
      text: element.value,
      sourceLanguageId: element.languageId,
      translationLanguageId,
      memoryIds,
      chunkIds: element.chunkIds,
      minSimilarity: minConfidence,
      maxAmount,
    });

    // Forward stream results to queue, and fire async LLM adaptation for fuzzy matches
    const pendingAdaptations: Promise<void>[] = [];
    const suggestionChannelKey = `suggestions:channel:${elementId}`;

    void (async () => {
      try {
        for await (const memory of stream) {
          memoriesQueue.push(memory);

          // Fire LLM adaptation for non-exact, non-template-replaced results
          if (
            memory.adaptationMethod !== "exact" &&
            memory.adaptationMethod !== "token-replaced" &&
            memory.confidence < 1
          ) {
            const adaptationPromise = adaptMemoryOp({
              sourceText: element.value,
              memorySource: memory.source,
              memoryTranslation: memory.translation,
              sourceLanguageId: element.languageId,
              translationLanguageId,
            })
              .then(async ({ adaptedTranslation }) => {
                if (!adaptedTranslation) return;
                const suggestion: TranslationSuggestion = {
                  translation: adaptedTranslation,
                  confidence: memory.confidence,
                };
                await redisPub.publish(
                  suggestionChannelKey,
                  JSON.stringify(suggestion),
                );
              })
              .catch((err: unknown) => {
                logger.error(
                  "WORKER",
                  { msg: "LLM memory adaptation failed" },
                  err,
                );
              });
            pendingAdaptations.push(adaptationPromise);
          }
        }
      } catch (err) {
        logger.error("WORKER", { msg: "Stream search memory failed" }, err);
      }
    })();

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

    return await executeQuery({ db: drizzle }, listOwnedMemories, {
      creatorId: input.userId,
    });
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

    return await executeQuery({ db: drizzle }, getMemory, input);
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

    return await executeQuery({ db: drizzle }, listProjectMemories, input);
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

    return await executeQuery({ db: drizzle }, countMemoryItems, input);
  });
