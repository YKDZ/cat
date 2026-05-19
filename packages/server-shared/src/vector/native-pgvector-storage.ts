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
 * @zh 基于内建 PostgreSQL vector capabilities 的原生向量存储服务。
 * @en Native vector storage service backed by the built-in PostgreSQL vector capabilities.
 */
export class NativePgVectorStorage extends VectorStorage {
  public constructor(private readonly ctx: NativePgVectorStorageContext) {
    super();
  }

  /**
   * @zh 返回系统 pgvector 服务的稳定 ID。
   * @en Return the stable ID for the system pgvector service.
   *
   * @returns - {@zh 服务 ID} {@en Service ID}
   */
  public override getId(): string {
    return "native-pgvector";
  }

  /**
   * @zh 初始化向量表结构。
   * @en Initialize the vector storage schema.
   *
   * @param ctx - {@zh 初始化上下文} {@en Initialization context}
   * @returns - {@zh 初始化完成后 resolve} {@en Resolves when initialization completes}
   */
  public override async init({ dimension }: InitContext): Promise<void> {
    await this.ctx.capabilities.vector.ensureSchema(dimension);
  }

  /**
   * @zh 存储 chunk 向量，并在首次写入前确保 schema 维度匹配。
   * @en Store chunk vectors and ensure the schema dimension matches before the first write.
   *
   * @param ctx - {@zh 向量写入上下文} {@en Vector storage context}
   * @returns - {@zh 存储完成后 resolve} {@en Resolves when storage completes}
   */
  public override async store({ chunks }: StoreContext): Promise<void> {
    const [firstChunk] = chunks;
    if (!firstChunk) return;

    await this.ctx.capabilities.vector.ensureSchema(firstChunk.vector.length);
    await this.ctx.capabilities.vector.upsertChunkVectors(chunks);
  }

  /**
   * @zh 读取指定 chunk 的向量。
   * @en Retrieve vectors for the given chunk IDs.
   *
   * @param ctx - {@zh 向量读取上下文} {@en Vector retrieval context}
   * @returns - {@zh chunk 向量结果} {@en Chunk vector results}
   */
  public override async retrieve({
    chunkIds,
  }: RetrieveContext): Promise<{ chunkId: number; vector: number[] }[]> {
    return this.ctx.capabilities.vector.getChunkVectors(chunkIds);
  }

  /**
   * @zh 执行余弦相似度检索。
   * @en Run cosine-similarity search against stored vectors.
   *
   * @param ctx - {@zh 余弦检索上下文} {@en Cosine similarity context}
   * @returns - {@zh 相似度结果列表} {@en Similarity result list}
   */
  public override async cosineSimilarity(
    ctx: CosineSimilarityContext,
  ): Promise<{ chunkId: number; similarity: number }[]> {
    return this.ctx.capabilities.vector.searchChunkCosineSimilarity(ctx);
  }

  /**
   * @zh 更新底层向量维度。
   * @en Update the underlying vector dimension.
   *
   * @param ctx - {@zh 维度更新上下文} {@en Dimension update context}
   * @returns - {@zh 维度更新完成后 resolve} {@en Resolves when the dimension update completes}
   */
  public override async updateDimension({
    dimension,
  }: UpdateDimensionContext): Promise<void> {
    await this.ctx.capabilities.vector.updateDimension(dimension);
  }
}
