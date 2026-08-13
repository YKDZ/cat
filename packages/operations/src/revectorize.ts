import type { OperationContext } from "@cat/domain";
import { getDbHandle } from "@cat/domain";
import {
  bulkUpdateChunkVectorMetadata,
  executeCommand,
  executeQuery,
  listChunkVectorizationInputs,
} from "@cat/domain";
import { PluginManager } from "@cat/plugin-core";
import { resolveServiceImplementation } from "@cat/server-shared";
import { ServiceImplementationReferenceSchema } from "@cat/shared";
import { z } from "zod";

export const RevectorizeInputSchema = z.object({
  chunkIds: z.array(z.int()),
  vectorizer: ServiceImplementationReferenceSchema,
  vectorStorage: ServiceImplementationReferenceSchema,
});

export const RevectorizeOutputSchema = z.object({});

export type RevectorizeInput = z.infer<typeof RevectorizeInputSchema>;
export type RevectorizeOutput = z.infer<typeof RevectorizeOutputSchema>;

/**
 *
 * 使用新的向量化器更新既有 chunk 的嵌入向量，
 * 适用于切换向量化模型后的数据迁移场景。
 * Re-vectorize existing chunks.
 *
 * Updates the embedding vectors of existing chunks using a new
 * vectorizer. Intended for data migration when switching vectorization
 * models.
 *
 * @param payload - Re-vectorization input parameters
 * @param _ctx - Operation context (unused)
 * @returns - Empty object
 */
export const revectorizeOp = async (
  payload: RevectorizeInput,
  _ctx?: OperationContext,
): Promise<RevectorizeOutput> => {
  const { chunkIds, vectorizer, vectorStorage } = payload;

  if (chunkIds.length === 0) return {};

  const { client: db } = await getDbHandle();
  const pluginManager = PluginManager.get("GLOBAL", "");

  // 1. 获取 chunk 关联的源文本
  const chunksData = await executeQuery({ db }, listChunkVectorizationInputs, {
    chunkIds,
  });

  if (chunksData.length === 0) return {};

  // 2. 解析插件服务
  const vectorizerService = resolveServiceImplementation(
    pluginManager,
    vectorizer,
    "TEXT_VECTORIZER",
  );
  const storageService = resolveServiceImplementation(
    pluginManager,
    vectorStorage,
    "VECTOR_STORAGE",
  );

  // 3. 批量向量化
  const inputs = chunksData.map((c) => ({
    text: c.text,
    languageId: c.languageId,
  }));

  const results = await vectorizerService.vectorize({ elements: inputs });

  if (results.length !== chunksData.length) {
    throw new Error(`Vectorizer returned mismatching results`);
  }

  // 4. 准备更新
  const storePayload: { chunkId: number; vector: number[] }[] = [];
  const chunkUpdates: {
    id: number;
    vectorizer: typeof vectorizer;
    vectorStorage: typeof vectorStorage;
  }[] = [];

  for (let i = 0; i < chunksData.length; i += 1) {
    const chunkData = chunksData[i];
    const result = results[i];
    if (!chunkData || !result) {
      throw new Error("vectorizer result length mismatch with chunk data");
    }

    if (result.length > 0) {
      const vectorData = result[0];
      if (!vectorData) {
        throw new Error("vectorizer returned an empty vector result");
      }
      storePayload.push({
        chunkId: chunkData.chunkId,
        vector: vectorData.vector,
      });
      chunkUpdates.push({
        id: chunkData.chunkId,
        vectorizer,
        vectorStorage,
      });
    }
  }

  // 5. 存储向量
  if (storePayload.length > 0) {
    await storageService.store({ chunks: storePayload });
  }

  // 6. 更新 chunk 元数据
  await executeCommand({ db }, bulkUpdateChunkVectorMetadata, {
    chunkIds: chunkUpdates.map((item) => item.id),
    vectorizer,
    vectorStorage,
  });

  return {};
};
