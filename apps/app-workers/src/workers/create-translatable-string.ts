import { defineWorkflow } from "@/core";
import { createStringFromData } from "@cat/app-server-shared/utils";
import { getDrizzleDB } from "@cat/db";
import * as z from "zod";
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

export const createTranslatableStringTask = await defineWorkflow({
  name: "translatable-string.create",
  input: CreateTranslatableStringInputSchema,
  output: CreateTranslatableStringOutputSchema,

  dependencies: async (payload, { traceId }) => [
    await vectorizeToChunkSetTask.asChild(
      {
        data: payload.data,
        vectorizerId: payload.vectorizerId,
        vectorStorageId: payload.vectorStorageId,
      },
      { traceId },
    ),
  ],

  handler: async (data, { getTaskResult }) => {
    const { client: drizzle } = await getDrizzleDB();

    const [{ chunkSetIds }] = getTaskResult(vectorizeToChunkSetTask);

    if (data.data.length === 0) return { stringIds: [] };

    const stringIds = await drizzle.transaction(async (tx) => {
      return await createStringFromData(tx, chunkSetIds, data.data);
    });

    return { stringIds };
  },
});
