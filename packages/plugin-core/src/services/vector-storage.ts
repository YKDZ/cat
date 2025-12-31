import type { IPluginService } from "@/services/service";
import type { PluginServiceType } from "@cat/shared/schema/drizzle/enum";

export type StoreContext = {
  chunks: { vector: number[]; chunkId: number }[];
};

export type RetrieveContext = {
  chunkIds: number[];
};

export type CosineSimilarityContext = {
  vectors: number[][];
  chunkIdRange: number[];
  minSimilarity: number;
  maxAmount: number;
};

export abstract class VectorStorage implements IPluginService {
  abstract getId(): string;
  getType(): PluginServiceType {
    return "VECTOR_STORAGE";
  }
  abstract store(ctx: StoreContext): Promise<void>;
  abstract retrieve(
    ctx: RetrieveContext,
  ): Promise<{ vector: number[]; chunkId: number }[]>;
  abstract cosineSimilarity(
    ctx: CosineSimilarityContext,
  ): Promise<{ chunkId: number; similarity: number }[]>;
}
