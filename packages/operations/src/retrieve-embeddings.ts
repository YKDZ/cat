import type { OperationContext } from "@cat/domain";

import { getDbHandle } from "@cat/domain";
import { executeQuery, getChunkVectorStorageId } from "@cat/domain";
import { PluginManager, type VectorStorage } from "@cat/plugin-core";
import { getServiceFromDBId } from "@cat/server-shared";
import * as z from "zod";

export const RetrieveEmbeddingsInputSchema = z.object({
  chunkIds: z.array(z.int()),
});

export const RetrieveEmbeddingsOutputSchema = z.object({
  embeddings: z.array(z.array(z.number())),
  vectorStorageId: z.int(),
});

export type RetrieveEmbeddingsInput = z.infer<
  typeof RetrieveEmbeddingsInputSchema
>;
export type RetrieveEmbeddingsOutput = z.infer<
  typeof RetrieveEmbeddingsOutputSchema
>;

/**
 * @zh 获取 chunk 的嵌入向量。
 *
 * 从 VECTOR_STORAGE 插件中检索指定 chunk 的向量表示。
 * @en Retrieve embedding vectors for the given chunks.
 *
 * Fetches vector representations for the specified chunk IDs from
 * the VECTOR_STORAGE plugin.
 *
 * @param data - {@zh 输入参数，包含要检索的 chunk ID 列表} {@en Input parameters containing the chunk IDs to retrieve}
 * @param _ctx - {@zh 操作上下文（未使用）} {@en Operation context (unused)}
 * @returns - {@zh chunk 的嵌入向量列表及向量存储插件 ID} {@en List of embedding vectors and the vector storage plugin ID}
 */
export const retrieveEmbeddingsOp = async (
  data: RetrieveEmbeddingsInput,
  _ctx?: OperationContext,
): Promise<RetrieveEmbeddingsOutput> => {
  const { client: drizzle } = await getDbHandle();
  const pluginManager = PluginManager.get("GLOBAL", "");
  const firstChunkId = data.chunkIds.at(0) ?? 0;

  // TODO 暂时假设所有 chunk 的 storageId 都相同
  const vectorStorageId = await executeQuery(
    { db: drizzle },
    getChunkVectorStorageId,
    {
      chunkId: firstChunkId,
    },
  );
  if (vectorStorageId === null) {
    throw new Error(`Chunk ${String(firstChunkId)} not found`);
  }

  const vectorStorage = getServiceFromDBId<VectorStorage>(
    pluginManager,
    vectorStorageId,
  );

  const chunks = await vectorStorage.retrieve({ chunkIds: data.chunkIds });
  const embeddings = chunks.map((c) => c.vector);

  return {
    embeddings,
    vectorStorageId,
  };
};
