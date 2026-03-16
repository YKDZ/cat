import { PluginManager, type VectorStorage } from "@cat/plugin-core";
import { getServiceFromDBId } from "@cat/server-shared";
import * as z from "zod/v4";

import { defineGraphWorkflow } from "@/workflow/define-task";

import { retriveEmbeddingsTask } from "./retrive-embeddings";

const SearchChunkInputSchema = z.object({
  minSimilarity: z.number().min(0).max(1),
  maxAmount: z.int().min(0),
  searchRange: z.array(z.int()),
  queryChunkIds: z.array(z.int()),
  vectorStorageId: z.int(),
});

const SearchChunkOutputSchema = z.object({
  chunks: z.array(
    z.object({
      chunkId: z.int(),
      similarity: z.number().min(0).max(1),
    }),
  ),
});

export const searchChunkWorkflow = defineGraphWorkflow({
  name: "chunk.search",
  input: SearchChunkInputSchema,
  output: SearchChunkOutputSchema,
  cache: {
    enabled: true,
    ttl: 60,
  },
  steps: async (payload, { traceId, signal }) => {
    return [
      retriveEmbeddingsTask.asStep(
        {
          chunkIds: payload.queryChunkIds,
        },
        { traceId, signal },
      ),
    ];
  },
  handler: async (payload, ctx) => {
    const pluginManager = ctx.pluginManager ?? PluginManager.get("GLOBAL", "");
    const [embeddingsResult] = ctx.getStepResult(retriveEmbeddingsTask);
    const vectorStorage = getServiceFromDBId<VectorStorage>(
      pluginManager,
      payload.vectorStorageId,
    );

    const chunks = await vectorStorage.cosineSimilarity({
      vectors: embeddingsResult.embeddings,
      chunkIdRange: payload.searchRange,
      minSimilarity: payload.minSimilarity,
      maxAmount: payload.maxAmount,
    });

    return { chunks };
  },
});
