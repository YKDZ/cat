import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  collectMemoryRecallOp: vi.fn(),
}));

vi.mock("./collect-memory-recall.ts", async () => {
  const actual = await vi.importActual<
    typeof import("./collect-memory-recall.ts")
  >("./collect-memory-recall.ts");
  return { ...actual, collectMemoryRecallOp: mocks.collectMemoryRecallOp };
});

import { streamSearchMemoryOp } from "./stream-search-memory.ts";

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

  it("rejects an invalid collector result at the stream boundary", async () => {
    mocks.collectMemoryRecallOp.mockResolvedValue({
      requestedChannels: ["EXACT"],
      outcomes: {
        EXACT: { status: "SUCCEEDED", candidates: [] },
        FUZZY: { status: "SKIPPED", reason: "NOT_REQUESTED" },
        KEYWORD: { status: "SKIPPED", reason: "NOT_REQUESTED" },
        VARIANT: { status: "SKIPPED", reason: "NOT_REQUESTED" },
        SEMANTIC: { status: "SKIPPED", reason: "NOT_REQUESTED" },
      },
    });

    await expect(
      collect(
        streamSearchMemoryOp({
          text: "Order 43 completed",
          sourceLanguageId: "en",
          translationLanguageId: "zh-Hans",
          memoryIds: ["22222222-2222-4222-8222-222222222222"],
          chunkIds: [],
        }),
      ),
    ).rejects.toThrow();
  });

  it("streams the aggregated recall results in rank order", async () => {
    const candidate = {
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
    };
    mocks.collectMemoryRecallOp.mockResolvedValue({
      requestedChannels: ["VARIANT"],
      outcomes: {
        EXACT: { status: "SKIPPED", reason: "NOT_REQUESTED" },
        FUZZY: { status: "SKIPPED", reason: "NOT_REQUESTED" },
        KEYWORD: { status: "SKIPPED", reason: "NOT_REQUESTED" },
        VARIANT: { status: "SUCCEEDED", candidates: [candidate] },
        SEMANTIC: { status: "SKIPPED", reason: "NOT_REQUESTED" },
      },
    });

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
    expect(results).toHaveLength(2);
    expect(results[0]).toMatchObject({
      type: "CANDIDATE",
      candidate: { adaptedTranslation: "订单 43 已完成" },
    });
    expect(results[1]).toMatchObject({ type: "COMPLETED" });
  });
});
