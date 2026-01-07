import { defineWorkflow } from "@/core";
import { getServiceFromDBId, searchMemory } from "@cat/app-server-shared/utils";
import { getDrizzleDB } from "@cat/db";
import { PluginRegistry, type VectorStorage } from "@cat/plugin-core";
import { MemorySuggestionSchema } from "@cat/shared/schema/misc";
import * as z from "zod";
import { retriveEmbeddingsTask } from "./retrive-embeddings.ts";

export const SearchMemoryInputSchema = z.object({
  minSimilarity: z.number().min(0).max(1).optional(),
  maxAmount: z.int().min(0).optional(),
  /**
   * 被查找是否存在记忆的原文本的 chunkIds
   */
  chunkIds: z.array(z.int()),
  memoryIds: z.array(z.uuidv4()),
  sourceLanguageId: z.string(),
  translationLanguageId: z.string(),
});

export const SearchMemoryOutputSchema = z.object({
  memories: z.array(MemorySuggestionSchema),
});

export const searchMemoryWorkflow = await defineWorkflow({
  name: "memory.search",
  input: SearchMemoryInputSchema,
  output: SearchMemoryOutputSchema,

  dependencies: async (data, { traceId }) => [
    await retriveEmbeddingsTask.asChild(
      {
        chunkIds: data.chunkIds,
      },
      { traceId },
    ),
  ],

  handler: async (data, { getTaskResult }) => {
    const { client: drizzle } = await getDrizzleDB();
    const pluginRegistry = PluginRegistry.get("GLOBAL", "");

    const [embeddingsResult] = getTaskResult(retriveEmbeddingsTask);
    if (!embeddingsResult) {
      return { memories: [] };
    }

    const { embeddings, vectorStorageId } = embeddingsResult;

    const memories = await drizzle.transaction(async (tx) => {
      const vectorStorage = await getServiceFromDBId<VectorStorage>(
        tx,
        pluginRegistry,
        vectorStorageId,
      );

      return await searchMemory(
        tx,
        vectorStorage,
        embeddings,
        data.sourceLanguageId,
        data.translationLanguageId,
        data.memoryIds,
        data.minSimilarity,
        data.maxAmount,
      );
    });

    return { memories };
  },
});
