import type { JSONType } from "@cat/shared/schema/json";

import { getDrizzleDB } from "@cat/db";
import { createVectorizedChunks, executeCommand } from "@cat/domain";
import z from "zod";

import type { OperationContext } from "@/operations/types";

import { resolvePluginManager } from "@/utils";

const InputSchema = z.object({
  vectorizerId: z.int(),
  vectorStorageId: z.int(),
  data: z.array(
    z.object({
      languageId: z.string(),
      text: z.string(),
    }),
  ),
});

const OutputSchema = z.object({
  chunkSetIds: z.array(z.int()),
});

export const VectorizeInputSchema = InputSchema;
export const VectorizeOutputSchema = OutputSchema;

export type VectorizeInput = z.infer<typeof InputSchema>;
export type VectorizeOutput = z.infer<typeof OutputSchema>;

/**
 * 向量化文本并存储 ChunkSet
 *
 * 使用 TEXT_VECTORIZER 插件将文本转为向量，
 * 创建 ChunkSet/Chunk 行并通过 VECTOR_STORAGE 插件持久化向量。
 */
export const vectorizeToChunkSetOp = async (
  { data, vectorStorageId, vectorizerId }: VectorizeInput,
  ctx?: OperationContext,
): Promise<VectorizeOutput> => {
  const { client: drizzle } = await getDrizzleDB();
  const pluginManager = resolvePluginManager(ctx?.pluginManager);

  if (data.length === 0) return { chunkSetIds: [] };

  const vectorizer = pluginManager
    .getServices("TEXT_VECTORIZER")
    .find((service) => service.dbId === vectorizerId)?.service;
  const storage = pluginManager
    .getServices("VECTOR_STORAGE")
    .find((service) => service.dbId === vectorStorageId)?.service;

  if (!vectorizer || !storage) {
    throw new Error(
      [
        "Vectorize services not available in current plugin scope",
        `scope=${pluginManager.scopeType}:${pluginManager.scopeId}`,
        `vectorizerId=${vectorizerId}`,
        `availableVectorizers=${pluginManager
          .getServices("TEXT_VECTORIZER")
          .map((service) => service.dbId)
          .join(",")}`,
        `vectorStorageId=${vectorStorageId}`,
        `availableStorages=${pluginManager
          .getServices("VECTOR_STORAGE")
          .map((service) => service.dbId)
          .join(",")}`,
      ].join(" | "),
    );
  }

  const chunkDataList = await vectorizer.vectorize({ elements: data });
  if (chunkDataList.length !== data.length) {
    throw new Error("Vectorizer result length mismatch with input texts");
  }

  const numSets = chunkDataList.length;

  type Flattened = {
    vector: number[];
    meta: JSONType;
    textIndex: number;
  };
  const flattened: Flattened[] = [];

  for (let i = 0; i < chunkDataList.length; i += 1) {
    const chunkData = chunkDataList[i];
    for (let j = 0; j < chunkData.length; j += 1) {
      flattened.push({
        vector: chunkData[j].vector,
        meta: chunkData[j].meta,
        textIndex: i,
      });
    }
  }

  const { chunkSetIds, chunkIds } = await executeCommand(
    { db: drizzle },
    createVectorizedChunks,
    {
      vectorizerId,
      vectorStorageId,
      chunkSetCount: numSets,
      chunks: flattened.map((item) => ({
        textIndex: item.textIndex,
        meta: item.meta,
      })),
    },
  );

  const storePayload = chunkIds.map((cid, idx) => ({
    chunkId: cid,
    vector: flattened[idx].vector,
    meta: flattened[idx].meta,
  }));

  await storage.store({ chunks: storePayload });

  return { chunkSetIds };
};
