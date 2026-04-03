import {
  VectorStorage,
  type CosineSimilarityContext,
  type InitContext,
  type PluginCapabilities,
  type RetrieveContext,
  type StoreContext,
  type UpdateDimensionContext,
} from "@cat/plugin-core";

export class Storage extends VectorStorage {
  public constructor(private readonly capabilities: PluginCapabilities) {
    super();
  }

  getId(): string {
    return "pgvector-storage";
  }

  async store({ chunks }: StoreContext): Promise<void> {
    await this.capabilities.vector.upsertChunkVectors(chunks);
  }

  async retrieve({
    chunkIds,
  }: RetrieveContext): Promise<{ vector: number[]; chunkId: number }[]> {
    return await this.capabilities.vector.getChunkVectors(chunkIds);
  }

  async cosineSimilarity({
    vectors,
    chunkIdRange,
    minSimilarity,
    maxAmount,
  }: CosineSimilarityContext): Promise<
    { chunkId: number; similarity: number }[]
  > {
    return await this.capabilities.vector.searchChunkCosineSimilarity({
      vectors,
      chunkIdRange,
      minSimilarity,
      maxAmount,
    });
  }

  async updateDimension(ctx: UpdateDimensionContext): Promise<void> {
    await this.capabilities.vector.updateDimension(ctx.dimension);
  }

  async init(ctx: InitContext): Promise<void> {
    await this.capabilities.vector.ensureSchema(ctx.dimension);
  }
}
