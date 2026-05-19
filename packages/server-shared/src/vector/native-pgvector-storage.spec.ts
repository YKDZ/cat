import type { PluginCapabilities } from "@cat/domain";

import { describe, expect, it, vi } from "vitest";

import { NativePgVectorStorage } from "./native-pgvector-storage";

const createVectorCapabilities = () => {
  const ensureSchema = vi.fn().mockResolvedValue(undefined);
  const upsertChunkVectors = vi.fn().mockResolvedValue(undefined);
  const getChunkVectors = vi
    .fn()
    .mockResolvedValue([{ chunkId: 7, vector: [0.1, 0.2, 0.3] }]);
  const searchChunkCosineSimilarity = vi
    .fn()
    .mockResolvedValue([{ chunkId: 7, similarity: 0.95 }]);
  const updateDimension = vi.fn().mockResolvedValue(undefined);
  const vector: PluginCapabilities["vector"] = {
    ensureSchema,
    upsertChunkVectors,
    getChunkVectors,
    searchChunkCosineSimilarity,
    updateDimension,
  };

  return {
    ensureSchema,
    getChunkVectors,
    searchChunkCosineSimilarity,
    updateDimension,
    upsertChunkVectors,
    vector,
  };
};

describe("NativePgVectorStorage", () => {
  it("lazy ensures the schema before storing chunk vectors", async () => {
    const capabilities = createVectorCapabilities();
    const storage = new NativePgVectorStorage({
      capabilities: { vector: capabilities.vector },
    });
    const chunks = [{ chunkId: 1, vector: [0.1, 0.2, 0.3, 0.4] }];

    await storage.store({ chunks });

    expect(capabilities.ensureSchema).toHaveBeenCalledWith(4);
    expect(capabilities.upsertChunkVectors).toHaveBeenCalledWith(chunks);
  });

  it("skips schema work for empty writes", async () => {
    const capabilities = createVectorCapabilities();
    const storage = new NativePgVectorStorage({
      capabilities: { vector: capabilities.vector },
    });

    await storage.store({ chunks: [] });

    expect(capabilities.ensureSchema).not.toHaveBeenCalled();
    expect(capabilities.upsertChunkVectors).not.toHaveBeenCalled();
  });

  it("delegates retrieve, similarity, dimension updates, and init", async () => {
    const capabilities = createVectorCapabilities();
    const storage = new NativePgVectorStorage({
      capabilities: { vector: capabilities.vector },
    });

    await expect(storage.retrieve({ chunkIds: [7] })).resolves.toEqual([
      { chunkId: 7, vector: [0.1, 0.2, 0.3] },
    ]);
    await expect(
      storage.cosineSimilarity({
        vectors: [[0.1, 0.2, 0.3]],
        chunkIdRange: [7],
        minSimilarity: 0.8,
        maxAmount: 3,
      }),
    ).resolves.toEqual([{ chunkId: 7, similarity: 0.95 }]);

    await storage.updateDimension({ dimension: 1536 });
    await storage.init({ dimension: 1024 });

    expect(capabilities.getChunkVectors).toHaveBeenCalledWith([7]);
    expect(capabilities.searchChunkCosineSimilarity).toHaveBeenCalledWith({
      vectors: [[0.1, 0.2, 0.3]],
      chunkIdRange: [7],
      minSimilarity: 0.8,
      maxAmount: 3,
    });
    expect(capabilities.updateDimension).toHaveBeenCalledWith(1536);
    expect(capabilities.ensureSchema).toHaveBeenLastCalledWith(1024);
  });
});
