import type { PluginCapabilities } from "@cat/domain";

import {
  VectorStorage,
  type CosineSimilarityContext,
  type InitContext,
  type RetrieveContext,
  type StoreContext,
  type UpdateDimensionContext,
} from "@cat/plugin-core";

type NativePgVectorStorageContext = {
  capabilities: Pick<PluginCapabilities, "vector">;
};

/**
 * Native vector storage service backed by the built-in PostgreSQL vector capabilities.
 */
export class NativePgVectorStorage extends VectorStorage {
  public constructor(private readonly ctx: NativePgVectorStorageContext) {
    super();
  }

  /**
   * Return the stable ID for the system pgvector service.
   *
   * @returns - Service ID
   */
  public override getId(): string {
    return "native-pgvector";
  }

  /**
   * Initialize the vector storage schema.
   *
   * @param ctx - Initialization context
   * @returns - Resolves when initialization completes
   */
  public override async init({ dimension }: InitContext): Promise<void> {
    await this.ctx.capabilities.vector.ensureSchema(dimension);
  }

  /**
   * Store chunk vectors and ensure the schema dimension matches before the first write.
   *
   * @param ctx - Vector storage context
   * @returns - Resolves when storage completes
   */
  public override async store({ chunks }: StoreContext): Promise<void> {
    const [firstChunk] = chunks;
    if (!firstChunk) return;

    await this.ctx.capabilities.vector.ensureSchema(firstChunk.vector.length);
    await this.ctx.capabilities.vector.upsertChunkVectors(chunks);
  }

  /**
   * Retrieve vectors for the given chunk IDs.
   *
   * @param ctx - Vector retrieval context
   * @returns - Chunk vector results
   */
  public override async retrieve({
    chunkIds,
  }: RetrieveContext): Promise<{ chunkId: number; vector: number[] }[]> {
    return this.ctx.capabilities.vector.getChunkVectors(chunkIds);
  }

  /**
   * Run cosine-similarity search against stored vectors.
   *
   * @param ctx - Cosine similarity context
   * @returns - Similarity result list
   */
  public override async cosineSimilarity(
    ctx: CosineSimilarityContext,
  ): Promise<{ chunkId: number; similarity: number }[]> {
    return this.ctx.capabilities.vector.searchChunkCosineSimilarity(ctx);
  }

  /**
   * Update the underlying vector dimension.
   *
   * @param ctx - Dimension update context
   * @returns - Resolves when the dimension update completes
   */
  public override async updateDimension({
    dimension,
  }: UpdateDimensionContext): Promise<void> {
    await this.ctx.capabilities.vector.updateDimension(dimension);
  }
}
