import { getDrizzleDB } from "@cat/db";
import { executeQuery, getChunkVectorStorageId } from "@cat/domain";
import { PluginManager, type VectorStorage } from "@cat/plugin-core";
import * as z from "zod";

import type { OperationContext } from "@/operations/types";

import { getServiceFromDBId } from "@/utils";

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
 * 获取 chunk 的嵌入向量
 *
 * 从 VECTOR_STORAGE 插件中检索指定 chunk 的向量表示。
 */
export const retrieveEmbeddingsOp = async (
  data: RetrieveEmbeddingsInput,
  _ctx?: OperationContext,
): Promise<RetrieveEmbeddingsOutput> => {
  const { client: drizzle } = await getDrizzleDB();
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
