import { defineTask } from "@/core";
import {
  createStringFromData,
  firstOrGivenService,
} from "@cat/app-server-shared/utils";
import { getDrizzleDB } from "@cat/db";
import { PluginManager } from "@cat/plugin-core";
import { logger } from "@cat/shared/utils";
import * as z from "zod";

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
    const pluginManager = PluginManager.get("GLOBAL", "");

    if (data.data.length === 0) return { stringIds: [] };

    const vStorage = firstOrGivenService(pluginManager, "VECTOR_STORAGE");
    const vizer = firstOrGivenService(pluginManager, "TEXT_VECTORIZER");

    if (!vStorage || !vizer) {
      logger.warn("PROCESSOR", {
        msg: `No vector storage or text vectorizer service available. No string will be created`,
      });
      return {
        stringIds: [],
      };
    }

    const stringIds = await drizzle.transaction(async (tx) => {
      return await createStringFromData(
        tx,
        vizer.service,
        vizer.id,
        vStorage.service,
        vStorage.id,
        data.data,
      );
    });

    return { stringIds };
  },
});
