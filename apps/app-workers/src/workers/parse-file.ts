import { defineTask } from "@/core";
import {
  getServiceFromDBId,
  readableToBuffer,
} from "@cat/app-server-shared/utils";
import { and, blob, eq, file, getDrizzleDB } from "@cat/db";
import {
  PluginManager,
  type FileImporter,
  type StorageProvider,
} from "@cat/plugin-core";
import { safeZDotJson } from "@cat/shared/schema/json";
import {
  assertFirstNonNullish,
  assertSingleNonNullish,
} from "@cat/shared/utils";
import * as z from "zod";

export const ParseFileInputSchema = z.object({
  fileId: z.int(),
  languageId: z.string(),
});

export const ParseFileOutputSchema = z.object({
  elements: z.array(
    z.object({
      text: z.string(),
      sortIndex: z.int(),
      languageId: z.string(),
      meta: safeZDotJson,
    }),
  ),
});

export const parseFileTask = await defineTask({
  name: "file.parse",
  input: ParseFileInputSchema,
  output: ParseFileOutputSchema,

  handler: async (data) => {
    const { client: drizzle } = await getDrizzleDB();
    const pluginManager = PluginManager.get("GLOBAL", "");

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

    const provider = getServiceFromDBId<StorageProvider>(
      pluginManager,
      storageProviderId,
    );
    const handler = assertFirstNonNullish(
      pluginManager
        .getServices("FILE_IMPORTER")
        // oxlint-disable-next-line no-unsafe-type-assertion
        .filter((h) => (h.service as FileImporter).canImport({ name }))
        .map((h) => h.service),
    ) as FileImporter;

    const fileContent = await readableToBuffer(
      await provider.getStream({ key }),
    );
    const extracted = await handler.import({ fileContent });

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
