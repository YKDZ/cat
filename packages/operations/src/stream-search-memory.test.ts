import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  collectMemoryRecallOp: vi.fn(),
}));

vi.mock("./collect-memory-recall", () => ({
  collectMemoryRecallOp: mocks.collectMemoryRecallOp,
}));

import { streamSearchMemoryOp } from "./stream-search-memory";

const collect = async <T>(iterable: AsyncIterable<T>): Promise<T[]> => {
  const items: T[] = [];
  for await (const item of iterable) {
    items.push(item);
  }
  return items;
};

describe("streamSearchMemoryOp", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("streams the aggregated recall results in rank order", async () => {
    mocks.collectMemoryRecallOp.mockResolvedValue([
      {
        id: 1,
        source: "Order 42 completed",
        translation: "订单 42 已完成",
        adaptedTranslation: "订单 43 已完成",
        adaptationMethod: "token-replaced",
        confidence: 0.93,
        memoryId: "22222222-2222-4222-8222-222222222222",
        translationChunkSetId: null,
        creatorId: null,
        createdAt: new Date("2024-01-01T00:00:00.000Z"),
        updatedAt: new Date("2024-01-01T00:00:00.000Z"),
        evidences: [{ channel: "template", confidence: 0.93 }],
      },
    ]);

    const results = await collect(
      streamSearchMemoryOp({
        text: "Order 43 completed",
        sourceLanguageId: "en",
        translationLanguageId: "zh-Hans",
        memoryIds: ["22222222-2222-4222-8222-222222222222"],
        chunkIds: [1],
      }),
    );

    expect(mocks.collectMemoryRecallOp).toHaveBeenCalledWith(
      {
        text: "Order 43 completed",
        sourceLanguageId: "en",
        translationLanguageId: "zh-Hans",
        memoryIds: ["22222222-2222-4222-8222-222222222222"],
        chunkIds: [1],
        minSimilarity: 0.72,
        maxAmount: 3,
      },
      undefined,
    );
    expect(results).toHaveLength(1);
    expect(results[0]?.adaptedTranslation).toBe("订单 43 已完成");
  });
});
