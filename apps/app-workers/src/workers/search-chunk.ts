import { defineWorkflow } from "@/core";
import { getServiceFromDBId } from "@cat/app-server-shared/utils";
import { PluginManager, type VectorStorage } from "@cat/plugin-core";
import * as z from "zod";
import { retriveEmbeddingsTask } from "./retrive-embeddings";

const InputSchema = z.object({
  minSimilarity: z.number().min(0).max(1),
  maxAmount: z.int().min(0),
  searchRange: z.array(z.int()),
  vectorStorageId: z.int(),
});

const OutputSchema = z.object({
  chunks: z.array(
    z.object({
      chunkId: z.int(),
      similarity: z.number().min(0).max(1),
    }),
  ),
});

export const searchChunkWorkflow = await defineWorkflow({
  name: "chunk.search",
  input: InputSchema,
  output: OutputSchema,

  dependencies: async (data, { traceId }) => [
    await retriveEmbeddingsTask.asChild(
      {
        chunkIds: data.searchRange,
      },
      { traceId },
    ),
  ],

  handler: async (payload, { getTaskResult }) => {
    const pluginManager = PluginManager.get("GLOBAL", "");

    const [embeddingsResult] = getTaskResult(retriveEmbeddingsTask);

    const { minSimilarity, maxAmount, vectorStorageId, searchRange } = payload;

    const vectorStorage = getServiceFromDBId<VectorStorage>(
      pluginManager,
      vectorStorageId,
    );

    const chunks = await vectorStorage.cosineSimilarity({
      vectors: embeddingsResult.embeddings,
      chunkIdRange: searchRange,
      minSimilarity,
      maxAmount,
    });

    return { chunks };
  },
});
