import { defineWorkflow } from "@/core";
import { getServiceFromDBId, searchMemory } from "@cat/app-server-shared/utils";
import { getDrizzleDB } from "@cat/db";
import { PluginRegistry, type VectorStorage } from "@cat/plugin-core";
import { MemorySuggestionSchema } from "@cat/shared/schema/misc";
import z from "zod";
import { searchEmbeddingsTask } from "./search-embeddings";

export const SearchMemoryInputSchema = z.object({
  minSimilarity: z.number().min(0).max(1).optional(),
  maxAmount: z.int().min(0).optional(),
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

  dependencies: (data, { traceId }) => [
    searchEmbeddingsTask.asChild(
      {
        chunkIds: data.chunkIds,
      },
      { traceId },
    ),
  ],

  handler: async (data, { getTaskResult }) => {
    const { client: drizzle } = await getDrizzleDB();
    const pluginRegistry = PluginRegistry.get("GLOBAL", "");

    const [embeddingsResult] = getTaskResult(searchEmbeddingsTask);
    if (!embeddingsResult) {
      return { memories: [] };
    }

    const { embeddings, vectorStorageId } = embeddingsResult;

    const vectorStorage = await getServiceFromDBId<VectorStorage>(
      drizzle,
      pluginRegistry,
      vectorStorageId,
    );

    const memories = await searchMemory(
      drizzle,
      vectorStorage,
      embeddings,
      data.sourceLanguageId,
      data.translationLanguageId,
      data.memoryIds,
      data.minSimilarity,
      data.maxAmount,
    );

    return { memories };
  },
});
