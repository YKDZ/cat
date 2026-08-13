import type { OperationContext } from "@cat/domain";
import { getDbHandle } from "@cat/domain";
import { executeQuery, getChunkVectorStorageReference } from "@cat/domain";
import { PluginManager } from "@cat/plugin-core";
import { resolveServiceImplementation } from "@cat/server-shared";
import { ServiceImplementationReferenceSchema } from "@cat/shared";
import * as z from "zod";

export const RetrieveEmbeddingsInputSchema = z.object({
  chunkIds: z.array(z.int()),
});

export const RetrieveEmbeddingsOutputSchema = z.object({
  embeddings: z.array(z.array(z.number())),
  vectorStorage: ServiceImplementationReferenceSchema,
});

export type RetrieveEmbeddingsInput = z.infer<
  typeof RetrieveEmbeddingsInputSchema
>;
export type RetrieveEmbeddingsOutput = z.infer<
  typeof RetrieveEmbeddingsOutputSchema
>;

/**
 *
 * 从 VECTOR_STORAGE 插件中检索指定 chunk 的向量表示。
 * Retrieve embedding vectors for the given chunks.
 *
 * Fetches vector representations for the specified chunk IDs from
 * the VECTOR_STORAGE plugin.
 *
 * @param data - Input parameters containing the chunk IDs to retrieve
 * @param _ctx - Operation context (unused)
 * @returns - List of embedding vectors and the vector storage plugin ID
 */
export const retrieveEmbeddingsOp = async (
  data: RetrieveEmbeddingsInput,
  _ctx?: OperationContext,
): Promise<RetrieveEmbeddingsOutput> => {
  const { client: drizzle } = await getDbHandle();
  const pluginManager = PluginManager.get("GLOBAL", "");
  const firstChunkId = data.chunkIds.at(0) ?? 0;

  // TODO 暂时假设所有 chunk 的 storageId 都相同
  const vectorStorage = await executeQuery(
    { db: drizzle },
    getChunkVectorStorageReference,
    {
      chunkId: firstChunkId,
    },
  );
  if (vectorStorage === null) {
    throw new Error(`Chunk ${String(firstChunkId)} not found`);
  }

  const vectorStorageService = resolveServiceImplementation(
    pluginManager,
    vectorStorage,
    "VECTOR_STORAGE",
  );

  const chunks = await vectorStorageService.retrieve({
    chunkIds: data.chunkIds,
  });
  const embeddings = chunks.map((c) => c.vector);

  return {
    embeddings,
    vectorStorage,
  };
};
