import type { VectorStorage } from "@cat/plugin-core";

import {
  retrieveEmbeddingsOp,
  RetrieveEmbeddingsInputSchema,
} from "@cat/operations";
import { getServiceFromDBId } from "@cat/server-shared";
import * as z from "zod";

import { defineNode, defineTypedGraph } from "@/graph/typed-dsl";

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

const RetrieveEmbeddingsOutputSchema = z.object({
  embeddings: z.array(z.array(z.number())),
  vectorStorageId: z.int(),
});

const CosineSearchInputSchema = z.object({
  embeddings: z.array(z.array(z.number())),
  minSimilarity: z.number().min(0).max(1),
  maxAmount: z.int().min(0),
  searchRange: z.array(z.int()),
  vectorStorageId: z.int(),
});

export { SearchChunkInputSchema, SearchChunkOutputSchema };

export const searchChunkGraph = defineTypedGraph({
  id: "chunk-search",
  input: SearchChunkInputSchema,
  output: SearchChunkOutputSchema,
  nodes: {
    "retrieve-embeddings": defineNode({
      input: RetrieveEmbeddingsInputSchema,
      output: RetrieveEmbeddingsOutputSchema,
      inputMapping: {
        chunkIds: "queryChunkIds",
      },
      handler: async (input, ctx) =>
        retrieveEmbeddingsOp(input, {
          traceId: ctx.traceId,
          signal: ctx.signal,
        }),
    }),
    "cosine-search": defineNode({
      input: CosineSearchInputSchema,
      output: SearchChunkOutputSchema,
      inputMapping: {
        embeddings: "retrieve-embeddings.embeddings",
        minSimilarity: "minSimilarity",
        maxAmount: "maxAmount",
        searchRange: "searchRange",
        vectorStorageId: "vectorStorageId",
      },
      handler: async (input, ctx) => {
        const vectorStorage = getServiceFromDBId<VectorStorage>(
          ctx.pluginManager,
          input.vectorStorageId,
        );
        const chunks = await vectorStorage.cosineSimilarity({
          vectors: input.embeddings,
          chunkIdRange: input.searchRange,
          minSimilarity: input.minSimilarity,
          maxAmount: input.maxAmount,
        });
        return { chunks };
      },
    }),
  },
  edges: [{ from: "retrieve-embeddings", to: "cosine-search" }],
  entry: "retrieve-embeddings",
  exit: ["cosine-search"],
  config: {
    maxConcurrentNodes: 1,
    defaultTimeoutMs: 120_000,
    enableCheckpoints: true,
    checkpointIntervalMs: 1000,
  },
});
