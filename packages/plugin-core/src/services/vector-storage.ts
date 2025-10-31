import { IPluginService } from "@/registry/plugin-registry";

export interface IVectorStorage extends IPluginService {
  store(chunks: { vector: number[]; chunkId: number }[]): Promise<void>;
  retrieve(
    chunkIds: number[],
  ): Promise<{ vector: number[]; chunkId: number }[]>;
  cosineSimilarity(
    vectors: number[][],
    chunkIdRange: number[],
    minSimilarity: number,
    maxAmount: number,
  ): Promise<{ chunkId: number; similarity: number }[]>;
}
