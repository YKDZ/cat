import { createTranslatableStrings } from "@cat/domain";
import * as z from "zod/v4";

import { runAgentCommand } from "@/db/domain";
import { generateCacheKey } from "@/graph/cache";
import { defineGraphWorkflow } from "@/workflow/define-task";

import { vectorizeToChunkSetTask } from "./vectorize";

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

export const createTranslatableStringTask = defineGraphWorkflow({
  name: "translatable-string.create",
  input: CreateTranslatableStringInputSchema,
  output: CreateTranslatableStringOutputSchema,
  steps: async (payload, { traceId, signal }) => {
    return [
      vectorizeToChunkSetTask.asStep(
        {
          data: payload.data,
          vectorizerId: payload.vectorizerId,
          vectorStorageId: payload.vectorStorageId,
        },
        { traceId, signal },
      ),
    ];
  },
  handler: async (payload, ctx) => {
    const [{ chunkSetIds }] = ctx.getStepResult(vectorizeToChunkSetTask);

    if (payload.data.length === 0) {
      return { stringIds: [] };
    }

    const sideEffectKey = `strings:${generateCacheKey(payload.data)}`;
    const existing = await ctx.checkSideEffect<number[]>(sideEffectKey);
    if (existing !== null) {
      return { stringIds: existing };
    }

    const stringIds = await runAgentCommand(createTranslatableStrings, {
      chunkSetIds,
      data: payload.data,
    });

    await ctx.recordSideEffect(sideEffectKey, "db_write", stringIds);

    return { stringIds };
  },
});
