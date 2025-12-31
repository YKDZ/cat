import { defineTask } from "@/core";
import {
  getServiceFromDBId,
  readableToBuffer,
} from "@cat/app-server-shared/utils";
import { and, blob, eq, file, getDrizzleDB } from "@cat/db";
import { PluginRegistry, type StorageProvider } from "@cat/plugin-core";
import { TranslatableElementDataSchema } from "@cat/shared/schema/misc";
import {
  assertFirstNonNullish,
  assertSingleNonNullish,
} from "@cat/shared/utils";
import z from "zod";

export const ParseFileInputSchema = z.object({
  fileId: z.int(),
  languageId: z.string(),
});

export const ParseFileOutputSchema = z.object({
  elements: z.array(
    TranslatableElementDataSchema.extend({
      sortIndex: z.int(),
    }),
  ),
});

export const parseFileTask = await defineTask({
  name: "file.parse",
  input: ParseFileInputSchema,
  output: ParseFileOutputSchema,

  handler: async (data) => {
    const { client: drizzle } = await getDrizzleDB();
    const pluginRegistry = PluginRegistry.get("GLOBAL", "");

    const { name, key, storageProviderId } = assertSingleNonNullish(
      await drizzle
        .select({
          name: file.name,
          key: blob.key,
          storageProviderId: blob.storageProviderId,
        })
        .from(file)
        .innerJoin(blob, eq(blob.id, file.blobId))
        .where(and(eq(file.id, data.fileId), eq(file.isActive, true))),
      `File ${data.fileId} not found`,
    );

    const provider = await getServiceFromDBId<StorageProvider>(
      drizzle,
      pluginRegistry,
      storageProviderId,
    );
    const { service: handler } = assertFirstNonNullish(
      pluginRegistry
        .getPluginServices("TRANSLATABLE_FILE_HANDLER")
        .filter((h) => h.service.canExtractElement({ name })),
    );

    const fileContent = await readableToBuffer(
      await provider.getStream({ key }),
    );
    const extracted = await handler.extractElement({ fileContent });

    // 补全 sortIndex
    let maxSortIndex = -1;
    extracted.forEach((item) => {
      if (typeof item.sortIndex === "number") {
        maxSortIndex = Math.max(maxSortIndex, item.sortIndex);
      }
    });

    let currentIndex = maxSortIndex;
    const elements = extracted.map((item) => {
      const sortIndex =
        typeof item.sortIndex === "number"
          ? item.sortIndex
          : (currentIndex += 1);
      return {
        ...item,
        sortIndex,
        languageId: data.languageId,
      };
    });

    elements.sort((a, b) => a.sortIndex - b.sortIndex);

    return { elements };
  },
});
