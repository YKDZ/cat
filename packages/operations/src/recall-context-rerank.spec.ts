import type { MemorySuggestion } from "@cat/shared/schema/misc";
import type { RerankRequest, RerankResponse } from "@cat/shared/schema/rerank";

import { PluginManager, RerankProvider } from "@cat/plugin-core";
import { describe, expect, it, vi } from "vitest";

import { recallContextRerankOp } from "./recall-context-rerank";

vi.mock("@cat/domain", async () => {
  const actual =
    await vi.importActual<typeof import("@cat/domain")>("@cat/domain");
  return {
    ...actual,
    getDbHandle: vi.fn().mockResolvedValue({ client: {} }),
    executeQuery: vi.fn().mockResolvedValue([]),
    listNeighborElements: vi.fn(),
  };
});

const MEMORY_UUID = "22222222-2222-4222-8222-222222222222";
const NOW = new Date("2024-01-01T00:00:00.000Z");

const makeMemory = (
  id: number,
  source: string,
  translation: string,
  confidence: number,
): MemorySuggestion => ({
  id,
  translationChunkSetId: null,
  source,
  translation,
  memoryId: MEMORY_UUID,
  creatorId: null,
  confidence,
  createdAt: NOW,
  updatedAt: NOW,
  evidences: [{ channel: "exact", confidence }],
});

class StubRerankProvider extends RerankProvider {
  getId() {
    return "stub";
  }
  getModelName() {
    return "stub-model";
  }
  rerank =
    vi.fn<(input: { request: RerankRequest }) => Promise<RerankResponse>>();
}

const makePluginManager = (provider: StubRerankProvider): PluginManager => {
  const manager = new PluginManager("GLOBAL", "");
  vi.spyOn(manager, "getServices").mockReturnValue([
    {
      pluginId: "stub-plugin",
      type: "RERANK_PROVIDER" as const,
      id: "stub",
      dbId: 1,
      service: provider,
    },
  ]);
  return manager;
};

describe("recallContextRerankOp", () => {
  it("returns single memory unchanged", async () => {
    const memories = [makeMemory(1, "hello", "你好", 0.9)];
    const result = await recallContextRerankOp({
      elementId: 1,
      queryText: "hello",
      memories,
    });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(1);
  });

  it("returns original order when no provider is configured", async () => {
    const memories = [
      makeMemory(1, "memory bank reset", "记忆库复位", 0.9),
      makeMemory(2, "memory bank init", "记忆库初始化", 0.88),
    ];
    // No provider in plugin manager
    const result = await recallContextRerankOp(
      { elementId: 1, queryText: "memory bank", memories },
      { traceId: "t1", pluginManager: new PluginManager("GLOBAL", "") },
    );
    // No reranking applied — fallback to original order
    expect(result[0].id).toBe(1);
    expect(result[1].id).toBe(2);
  });

  it("does NOT mutate confidence values", async () => {
    const memories = [
      makeMemory(1, "memory bank reset", "记忆库复位", 0.9),
      makeMemory(2, "memory bank init", "记忆库初始化", 0.88),
    ];

    const provider = new StubRerankProvider();
    provider.rerank.mockResolvedValue({
      scores: [
        { candidateId: "memory:2", score: 0.95 },
        { candidateId: "memory:1", score: 0.5 },
      ],
    });
    const pluginManager = makePluginManager(provider);

    const result = await recallContextRerankOp(
      { elementId: 1, queryText: "memory bank init", memories },
      { traceId: "t1", pluginManager },
    );

    // confidence should NOT be modified
    const mem1 = result.find((m) => m.id === 1);
    const mem2 = result.find((m) => m.id === 2);
    expect(mem1?.confidence).toBe(0.9);
    expect(mem2?.confidence).toBe(0.88);
  });

  it("returns original order on fail-closed outcome", async () => {
    const memories = [
      makeMemory(1, "memory bank reset", "记忆库复位", 0.9),
      makeMemory(2, "memory bank init", "记忆库初始化", 0.88),
    ];
    const provider = new StubRerankProvider();
    provider.rerank.mockRejectedValue(new Error("network error"));
    const pluginManager = makePluginManager(provider);

    const result = await recallContextRerankOp(
      { elementId: 1, queryText: "memory bank", memories },
      { traceId: "t1", pluginManager },
    );
    // Original order
    expect(result[0].id).toBe(1);
    expect(result[1].id).toBe(2);
  });
});
