import { getSearchMemoryChunkRange } from "@cat/domain";
import { searchMemoryOp } from "@cat/operations";
import { MemorySuggestionSchema } from "@cat/shared/schema/misc";
import * as z from "zod/v4";

import { runAgentQuery } from "@/db/domain";
import { defineGraphWorkflow } from "@/workflow/define-task";

import { searchChunkWorkflow } from "./search-chunk";

export const SearchMemoryInputSchema = z.object({
  minSimilarity: z.number().min(0).max(1),
  maxAmount: z.int().min(0),
  chunkIds: z.array(z.int()),
  memoryIds: z.array(z.uuidv4()),
  sourceLanguageId: z.string(),
  translationLanguageId: z.string(),
  vectorStorageId: z.int(),
});

export const SearchMemoryOutputSchema = z.object({
  memories: z.array(MemorySuggestionSchema),
});

export const searchMemoryWorkflow = defineGraphWorkflow({
  name: "memory.search",
  input: SearchMemoryInputSchema,
  output: SearchMemoryOutputSchema,
  steps: async (payload, { traceId, signal }) => {
    if (payload.chunkIds.length === 0) {
      return [];
    }

    const searchRange = await runAgentQuery(getSearchMemoryChunkRange, {
      memoryIds: payload.memoryIds,
      sourceLanguageId: payload.sourceLanguageId,
      translationLanguageId: payload.translationLanguageId,
    });

    return [
      searchChunkWorkflow.asStep(
        {
          minSimilarity: payload.minSimilarity,
          maxAmount: payload.maxAmount,
          searchRange,
          queryChunkIds: payload.chunkIds,
          vectorStorageId: payload.vectorStorageId,
        },
        { traceId, signal },
      ),
    ];
  },
  handler: async (payload, ctx) => {
    const [searchChunkResult] = ctx.getStepResult(searchChunkWorkflow);
    if (!searchChunkResult) {
      return { memories: [] };
    }

    const { memories } = await searchMemoryOp(
      {
        chunkIds: searchChunkResult.chunks.map((item) => item.chunkId),
        sourceLanguageId: payload.sourceLanguageId,
        translationLanguageId: payload.translationLanguageId,
        memoryIds: payload.memoryIds,
        maxAmount: payload.maxAmount,
        minSimilarity: payload.minSimilarity,
        vectorStorageId: payload.vectorStorageId,
      },
      { traceId: ctx.traceId, pluginManager: ctx.pluginManager },
    );

    return { memories };
  },
});
