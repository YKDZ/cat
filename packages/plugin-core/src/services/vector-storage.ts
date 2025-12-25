import type { IPluginService } from "@/services/service";
import type { PluginServiceType } from "@cat/shared/schema/drizzle/enum";

export abstract class IVectorStorage implements IPluginService {
  abstract getId(): string;
  getType(): PluginServiceType {
    return "VECTOR_STORAGE";
  }
  abstract store(
    chunks: { vector: number[]; chunkId: number }[],
  ): Promise<void>;
  abstract retrieve(
    chunkIds: number[],
  ): Promise<{ vector: number[]; chunkId: number }[]>;
  abstract cosineSimilarity(
    vectors: number[][],
    chunkIdRange: number[],
    minSimilarity: number,
    maxAmount: number,
  ): Promise<{ chunkId: number; similarity: number }[]>;
}
