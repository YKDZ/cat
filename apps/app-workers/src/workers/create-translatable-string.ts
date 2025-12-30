import { defineTask } from "@/core";
import {
  createStringFromData,
  firstOrGivenService,
} from "@cat/app-server-shared/utils";
import { getDrizzleDB } from "@cat/db";
import { PluginRegistry } from "@cat/plugin-core";
import z from "zod";

export const CreateTranslatableStringInputSchema = z.object({
  data: z.array(
    z.object({
      text: z.string(),
      languageId: z.string(),
    }),
  ),
  vectorizerId: z.int().optional(),
  vectorStorageId: z.int().optional(),
});

export const CreateTranslatableStringOutputSchema = z.object({
  stringIds: z.array(z.int()),
});

export const createTranslatableStringTask = await defineTask({
  name: "translatable-string.create",
  input: CreateTranslatableStringInputSchema,
  output: CreateTranslatableStringOutputSchema,

  handler: async (data) => {
    const { client: drizzle } = await getDrizzleDB();
    const pluginRegistry = PluginRegistry.get("GLOBAL", "");

    if (data.data.length === 0) return { stringIds: [] };

    const vectorizer = await firstOrGivenService(
      drizzle,
      pluginRegistry,
      "TEXT_VECTORIZER",
      data.vectorizerId,
    );
    const vectorStorage = await firstOrGivenService(
      drizzle,
      pluginRegistry,
      "VECTOR_STORAGE",
      data.vectorStorageId,
    );

    if (!vectorStorage) throw new Error("Vector storage service not found");
    if (!vectorizer) throw new Error("Vectorizer service not found");

    const stringIds = await createStringFromData(
      drizzle,
      vectorizer.service,
      vectorizer.id,
      vectorStorage.service,
      vectorStorage.id,
      data.data,
    );

    return { stringIds };
  },
});
