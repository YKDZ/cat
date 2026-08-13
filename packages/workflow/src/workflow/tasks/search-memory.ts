import { searchMemoryOp } from "@cat/operations";
import {
  MemorySuggestionSchema,
  ServiceImplementationReferenceSchema,
} from "@cat/shared";
import * as z from "zod";

import { defineNode, defineGraph } from "#/graph/dsl/index.ts";

export const SearchMemoryInputSchema = z.object({
  minSimilarity: z.number().min(0).max(1),
  maxAmount: z.int().min(0),
  chunkIds: z.array(z.int()),
  memoryIds: z.array(z.uuidv4()),
  sourceLanguageId: z.string(),
  translationLanguageId: z.string(),
  vectorStorage: ServiceImplementationReferenceSchema,
});

export const SearchMemoryOutputSchema = z.object({
  memories: z.array(MemorySuggestionSchema),
});

export const searchMemoryGraph = defineGraph({
  id: "memory-search",
  input: SearchMemoryInputSchema,
  output: SearchMemoryOutputSchema,
  nodes: {
    main: defineNode({
      input: SearchMemoryInputSchema,
      output: SearchMemoryOutputSchema,
      handler: async (input, ctx) =>
        searchMemoryOp(input, {
          traceId: ctx.traceId,
          signal: ctx.signal,
          pluginManager: ctx.pluginManager,
        }),
    }),
  },
  edges: [],
  entry: "main",
  exit: ["main"],
});
