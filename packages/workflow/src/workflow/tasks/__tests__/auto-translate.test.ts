import { PluginManager } from "@cat/plugin-core";
import { setupTestDB, TestPluginLoader, type TestDB } from "@cat/test-utils";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { createDefaultGraphRuntime } from "@/graph";

const mocks = vi.hoisted(() => ({
  collectMemoryRecallOp: vi.fn(),
  fetchAdviseOp: vi.fn(),
  llmRefineTranslationOp: vi.fn(),
  termRecallOp: vi.fn(),
  nestedRunGraph: vi.fn(),
}));

vi.mock("@cat/operations", async () => {
  const actual =
    await vi.importActual<typeof import("@cat/operations")>("@cat/operations");

  return {
    ...actual,
    collectMemoryRecallOp: mocks.collectMemoryRecallOp,
    fetchAdviseOp: mocks.fetchAdviseOp,
    llmRefineTranslationOp: mocks.llmRefineTranslationOp,
    termRecallOp: mocks.termRecallOp,
  };
});

vi.mock("@/graph/dsl/run-graph", () => ({
  runGraph: mocks.nestedRunGraph,
}));

import { autoTranslateGraph } from "../auto-translate";

describe("autoTranslateGraph", () => {
  let cleanup: TestDB["cleanup"] | undefined;
  let pluginManager: PluginManager;

  beforeAll(async () => {
    const db = await setupTestDB();
    cleanup = db.cleanup;

    PluginManager.clear();
    pluginManager = PluginManager.get(
      "GLOBAL",
      "auto-translate-test",
      new TestPluginLoader(),
    );

    createDefaultGraphRuntime(db.client, pluginManager);
  });

  afterAll(async () => {
    PluginManager.clear();
    await cleanup?.();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.termRecallOp.mockResolvedValue({
      terms: [
        {
          term: "memory bank",
          translation: "记忆库",
          confidence: 0.82,
          definition: null,
          concept: { subjects: [], definition: null },
        },
      ],
    });
    mocks.collectMemoryRecallOp.mockResolvedValue([
      {
        id: 1,
        source: "Order 42 completed",
        translation: "订单 42 已完成",
        adaptedTranslation: "订单 43 已完成",
        adaptationMethod: "token-replaced",
        confidence: 0.97,
        memoryId: "22222222-2222-4222-8222-222222222222",
        translationChunkSetId: null,
        creatorId: null,
        createdAt: new Date("2024-01-01T00:00:00.000Z"),
        updatedAt: new Date("2024-01-01T00:00:00.000Z"),
        evidences: [{ channel: "template", confidence: 0.97 }],
      },
    ]);
    mocks.fetchAdviseOp.mockResolvedValue({
      suggestions: [{ translation: "建议译文", confidence: 0.5 }],
    });
    mocks.nestedRunGraph.mockResolvedValue({ translationIds: [99] });
  });

  it("feeds fused recall into MT advise instead of re-querying vector-only memory", async () => {
    const { runGraph } = await vi.importActual<
      typeof import("@/graph/dsl/run-graph")
    >("@/graph/dsl/run-graph");

    const result = await runGraph(
      autoTranslateGraph,
      {
        translatableElementId: 1,
        text: "Order 43 completed",
        translationLanguageId: "zh-Hans",
        sourceLanguageId: "en",
        translatorId: null,
        advisorId: 1,
        memoryIds: ["22222222-2222-4222-8222-222222222222"],
        glossaryIds: ["11111111-1111-4111-8111-111111111111"],
        chunkIds: [1],
        minMemorySimilarity: 0.72,
        maxMemoryAmount: 3,
        memoryVectorStorageId: 1,
        translationVectorStorageId: 2,
        vectorizerId: 3,
        documentId: "33333333-3333-4333-8333-333333333333",
      },
      { pluginManager },
    );

    expect(mocks.collectMemoryRecallOp).toHaveBeenCalledWith(
      expect.objectContaining({
        text: "Order 43 completed",
        vectorStorageId: 1,
      }),
      expect.any(Object),
    );
    expect(mocks.fetchAdviseOp).toHaveBeenCalledWith(
      expect.objectContaining({
        memoryIds: [],
        preloadedMemories: [
          {
            source: "Order 42 completed",
            translation: "订单 43 已完成",
            confidence: 0.97,
          },
        ],
        preloadedTerms: [
          {
            term: "memory bank",
            translation: "记忆库",
            confidence: 0.82,
            definition: null,
            concept: { subjects: [], definition: null },
          },
        ],
      }),
      expect.any(Object),
    );
    expect(mocks.nestedRunGraph).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        data: [
          expect.objectContaining({
            text: "订单 43 已完成",
          }),
        ],
      }),
      expect.any(Object),
    );
    expect(result).toEqual({ translationIds: [99] });
  });
});
