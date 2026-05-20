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
  resolveOperationScopeElementsOp: vi.fn(),
  nestedRunGraph: vi.fn(),
}));

vi.mock("@cat/operations", async () => {
  const actual =
    await vi.importActual<typeof import("@cat/operations")>("@cat/operations");
  return {
    ...actual,
    resolveOperationScopeElementsOp: mocks.resolveOperationScopeElementsOp,
  };
});

vi.mock("@/graph/dsl/run-graph", () => ({ runGraph: mocks.nestedRunGraph }));

import { batchAutoTranslateGraph } from "../batch-auto-translate";

describe("batchAutoTranslateGraph", () => {
  let cleanup: TestDB["cleanup"] | undefined;
  let pluginManager: PluginManager;

  beforeAll(async () => {
    const db = await setupTestDB();
    cleanup = db.cleanup;

    PluginManager.clear();
    pluginManager = PluginManager.get(
      "GLOBAL",
      "batch-auto-translate-spec",
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
    mocks.resolveOperationScopeElementsOp.mockResolvedValue({
      elements: [
        {
          id: 1,
          value: "Checkout",
          languageId: "en",
          primaryContentNodeId: "11111111-1111-4111-8111-111111111111",
          chunkIds: [11],
        },
        {
          id: 2,
          value: "Checkout now",
          languageId: "en",
          primaryContentNodeId: "11111111-1111-4111-8111-111111111111",
          chunkIds: [12],
        },
      ],
    });
    mocks.nestedRunGraph
      .mockResolvedValueOnce({
        translationIds: [101],
        scopeTranslationSeed: {
          elementId: 1,
          source: "Checkout",
          translation: "结账",
          sourceLanguageId: "en",
          targetLanguageId: "zh-Hans",
          primaryContentNodeId: "11111111-1111-4111-8111-111111111111",
          confidence: 0.92,
          trustLevel: "HIGH",
          reason: "batch-runtime",
        },
      })
      .mockResolvedValueOnce({ translationIds: [102] });
  });

  it("resolves reuse-first scopes and forwards runtime seeds to later elements", async () => {
    const { runGraph } = await vi.importActual<
      typeof import("@/graph/dsl/run-graph")
    >("@/graph/dsl/run-graph");
    const result = await runGraph(
      batchAutoTranslateGraph,
      {
        projectId: "11111111-1111-4111-8111-111111111111",
        contentNodeIds: [],
        elementIds: [],
        sortMode: "reuse-first",
        languageId: "zh-Hans",
        minMemorySimilarity: 0.72,
        maxMemoryAmount: 3,
        memoryVectorStorageId: 1,
        translationVectorStorageId: 2,
        vectorizerId: 3,
        translatorId: null,
        memoryIds: [],
        glossaryIds: [],
        config: { gatherScopeContext: true },
      },
      { pluginManager },
    );

    expect(mocks.resolveOperationScopeElementsOp).toHaveBeenCalledWith(
      expect.objectContaining({ sortMode: "reuse-first" }),
      expect.any(Object),
    );
    expect(mocks.nestedRunGraph.mock.calls[1]?.[1]).toMatchObject({
      translatableElementId: 2,
      scopeTranslationSeeds: [
        expect.objectContaining({ source: "Checkout", translation: "结账" }),
      ],
    });
    expect(result).toEqual({ translationIds: [101, 102], elementCount: 2 });
  });

  it("does not forward low-confidence or unrelated cross-node seeds", async () => {
    const { runGraph } = await vi.importActual<
      typeof import("@/graph/dsl/run-graph")
    >("@/graph/dsl/run-graph");
    mocks.nestedRunGraph.mockReset();
    mocks.resolveOperationScopeElementsOp.mockResolvedValueOnce({
      elements: [
        {
          id: 1,
          value: "Legal notice",
          languageId: "en",
          primaryContentNodeId: "11111111-1111-4111-8111-111111111111",
          chunkIds: [],
        },
        {
          id: 2,
          value: "Checkout now",
          languageId: "en",
          primaryContentNodeId: "22222222-2222-4222-8222-222222222222",
          chunkIds: [],
        },
      ],
    });
    mocks.nestedRunGraph
      .mockResolvedValueOnce({
        translationIds: [201],
        scopeTranslationSeed: {
          elementId: 1,
          source: "Legal notice",
          translation: "法律声明",
          sourceLanguageId: "en",
          targetLanguageId: "zh-Hans",
          primaryContentNodeId: "11111111-1111-4111-8111-111111111111",
          confidence: 0.6,
          trustLevel: "LOW",
          reason: "batch-runtime",
        },
      })
      .mockResolvedValueOnce({ translationIds: [202] });

    await runGraph(
      batchAutoTranslateGraph,
      {
        projectId: "11111111-1111-4111-8111-111111111111",
        contentNodeIds: [],
        elementIds: [],
        sortMode: "reuse-first",
        languageId: "zh-Hans",
        minMemorySimilarity: 0.72,
        maxMemoryAmount: 3,
        memoryVectorStorageId: 1,
        translationVectorStorageId: 2,
        vectorizerId: 3,
        translatorId: null,
        memoryIds: [],
        glossaryIds: [],
      },
      { pluginManager },
    );

    expect(mocks.nestedRunGraph.mock.calls[1]?.[1]).toMatchObject({
      translatableElementId: 2,
      scopeTranslationSeeds: [],
    });
  });
});
