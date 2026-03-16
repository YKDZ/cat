import type { OperationContext } from "@cat/domain";

import { getDbHandle } from "@cat/domain";
import {
  bulkUpdateChunkVectorMetadata,
  executeCommand,
  executeQuery,
  listChunkVectorizationInputs,
} from "@cat/domain";
import {
  PluginManager,
  type TextVectorizer,
  type VectorStorage,
} from "@cat/plugin-core";
import { z } from "zod";

export const RevectorizeInputSchema = z.object({
  chunkIds: z.array(z.int()),
  vectorizerId: z.int(),
  vectorStorageId: z.int(),
});

export const RevectorizeOutputSchema = z.object({});

export type RevectorizeInput = z.infer<typeof RevectorizeInputSchema>;
export type RevectorizeOutput = z.infer<typeof RevectorizeOutputSchema>;

/**
 * 重新向量化已有的 chunk
 *
 * 使用新的向量化器更新既有 chunk 的嵌入向量，
 * 适用于切换向量化模型后的数据迁移场景。
 */
export const revectorizeOp = async (
  payload: RevectorizeInput,
  _ctx?: OperationContext,
): Promise<RevectorizeOutput> => {
  const { chunkIds, vectorizerId, vectorStorageId } = payload;

  if (chunkIds.length === 0) return {};

  const { client: db } = await getDbHandle();
  const pluginManager = PluginManager.get("GLOBAL", "");

  // 1. 获取 chunk 关联的源文本
  const chunksData = await executeQuery({ db }, listChunkVectorizationInputs, {
    chunkIds,
  });

  if (chunksData.length === 0) return {};

  // 2. 解析插件服务
  const vectorizerService = pluginManager
    .getServices("TEXT_VECTORIZER")
    .find((s) => s.dbId === vectorizerId)?.service as
    | TextVectorizer
    | undefined;

  const storageService = pluginManager
    .getServices("VECTOR_STORAGE")
    .find((s) => s.dbId === vectorStorageId)?.service as
    | VectorStorage
    | undefined;

  if (!vectorizerService || !storageService) {
    throw new Error(
      `Service not found. Vectorizer: ${vectorizerId}, Storage: ${vectorStorageId}`,
    );
  }

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
    vectorizerId: number;
    vectorStorageId: number;
  }[] = [];

  for (let i = 0; i < chunksData.length; i += 1) {
    const chunkId = chunksData[i].chunkId;
    const result = results[i];

    if (result.length > 0) {
      const vectorData = result[0];
      storePayload.push({
        chunkId: chunkId,
        vector: vectorData.vector,
      });
      chunkUpdates.push({
        id: chunkId,
        vectorizerId: vectorizerId,
        vectorStorageId: vectorStorageId,
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
    vectorizerId,
    vectorStorageId,
  });

  return {};
};
