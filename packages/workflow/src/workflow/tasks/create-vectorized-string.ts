import { createVectorizedStringOp } from "@cat/operations";
import * as z from "zod";

import { generateCacheKey } from "@/graph/cache";
import { defineNode, defineGraph } from "@/graph/dsl";

export const CreateVectorizedStringInputSchema = z.object({
  data: z.array(
    z.object({
      text: z.string(),
      languageId: z.string(),
    }),
  ),
  vectorizerId: z.int(),
  vectorStorageId: z.int(),
});

export const CreateVectorizedStringOutputSchema = z.object({
  stringIds: z.array(z.int()),
});

export const createVectorizedStringGraph = defineGraph({
  id: "vectorized-string-create",
  input: CreateVectorizedStringInputSchema,
  output: CreateVectorizedStringOutputSchema,
  nodes: {
    "create-strings": defineNode({
      input: CreateVectorizedStringInputSchema,
      output: CreateVectorizedStringOutputSchema,
      handler: async (input, ctx) => {
        if (input.data.length === 0) return { stringIds: [] };

        const sideEffectKey = `strings:${generateCacheKey(input.data)}`;
        const existing = await ctx.checkSideEffect<number[]>(sideEffectKey);
        if (existing !== null) return { stringIds: existing };

        const result = await createVectorizedStringOp(input, {
          traceId: ctx.traceId,
          signal: ctx.signal,
          pluginManager: ctx.pluginManager,
        });

        await ctx.recordSideEffect(sideEffectKey, "db_write", result.stringIds);
        return result;
      },
    }),
  },
  edges: [],
  entry: "create-strings",
  exit: ["create-strings"],
  config: {
    maxConcurrentNodes: 1,
    defaultTimeoutMs: 30_000,
    enableCheckpoints: true,
    checkpointIntervalMs: 1000,
  },
});
