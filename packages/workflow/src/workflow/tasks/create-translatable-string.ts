import {
  createTranslatableStrings,
  executeCommand,
  getDbHandle,
} from "@cat/domain";
import {
  vectorizeToChunkSetOp,
  VectorizeInputSchema,
  VectorizeOutputSchema,
} from "@cat/operations";
import * as z from "zod/v4";

import { generateCacheKey } from "@/graph/cache";
import { defineNode, defineTypedGraph } from "@/graph/typed-dsl";

export const CreateTranslatableStringInputSchema = z.object({
  data: z.array(
    z.object({
      text: z.string(),
      languageId: z.string(),
    }),
  ),
  vectorizerId: z.int(),
  vectorStorageId: z.int(),
});

export const CreateTranslatableStringOutputSchema = z.object({
  stringIds: z.array(z.int()),
});

const CreateStringsInputSchema = z.object({
  chunkSetIds: z.array(z.int()),
  data: z.array(
    z.object({
      text: z.string(),
      languageId: z.string(),
    }),
  ),
});

export const createTranslatableStringGraph = defineTypedGraph({
  id: "translatable-string-create",
  input: CreateTranslatableStringInputSchema,
  output: CreateTranslatableStringOutputSchema,
  nodes: {
    vectorize: defineNode({
      input: VectorizeInputSchema,
      output: VectorizeOutputSchema,
      handler: async (input, ctx) =>
        vectorizeToChunkSetOp(input, {
          traceId: ctx.traceId,
          signal: ctx.signal,
          pluginManager: ctx.pluginManager,
        }),
    }),
    "create-strings": defineNode({
      input: CreateStringsInputSchema,
      output: CreateTranslatableStringOutputSchema,
      inputMapping: {
        chunkSetIds: "vectorize.chunkSetIds",
        data: "data",
      },
      handler: async (input, ctx) => {
        if (input.data.length === 0) {
          return { stringIds: [] };
        }

        const sideEffectKey = `strings:${generateCacheKey(input.data)}`;
        const existing = await ctx.checkSideEffect<number[]>(sideEffectKey);
        if (existing !== null) {
          return { stringIds: existing };
        }

        const { client: db } = await getDbHandle();
        const stringIds = await executeCommand(
          { db },
          createTranslatableStrings,
          {
            chunkSetIds: input.chunkSetIds,
            data: input.data,
          },
        );

        await ctx.recordSideEffect(sideEffectKey, "db_write", stringIds);
        return { stringIds };
      },
    }),
  },
  edges: [{ from: "vectorize", to: "create-strings" }],
  entry: "vectorize",
  exit: ["create-strings"],
  config: {
    maxConcurrentNodes: 1,
    defaultTimeoutMs: 120_000,
    enableCheckpoints: true,
    checkpointIntervalMs: 1000,
  },
});
