import { defineTask } from "@/core";
import { getServiceFromDBId } from "@cat/app-server-shared/utils";
import { chunk, eq, getDrizzleDB } from "@cat/db";
import { PluginRegistry, type VectorStorage } from "@cat/plugin-core";
import { assertSingleNonNullish } from "@cat/shared/utils";
import * as z from "zod";

export const RetriveEmbeddingsInputSchema = z.object({
  chunkIds: z.array(z.int()),
});

export const RetriveEmbeddingsOutputSchema = z.object({
  embeddings: z.array(z.array(z.number())),
  vectorStorageId: z.int(),
});

export const retriveEmbeddingsTask = await defineTask({
  name: "embeddings.retrive",
  input: RetriveEmbeddingsInputSchema,
  output: RetriveEmbeddingsOutputSchema,

  handler: async (data) => {
    const { client: drizzle } = await getDrizzleDB();
    const pluginRegistry = PluginRegistry.get("GLOBAL", "");

    // TODO 暂时假设所有 chunk 的 storageId 都相同
    const { vectorStorageId } = assertSingleNonNullish(
      await drizzle
        .select({
          vectorStorageId: chunk.vectorStorageId,
        })
        .from(chunk)
        .where(eq(chunk.id, data.chunkIds.at(0) ?? 0)),
    );

    const vectorStorage = await getServiceFromDBId<VectorStorage>(
      drizzle,
      pluginRegistry,
      vectorStorageId,
    );

    const chunks = await vectorStorage.retrieve({ chunkIds: data.chunkIds });
    const embeddings = chunks.map((c) => c.vector);

    return {
      embeddings,
      vectorStorageId,
    };
  },
});
