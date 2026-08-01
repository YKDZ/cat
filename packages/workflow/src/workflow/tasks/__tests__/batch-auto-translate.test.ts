import { PluginManager } from "@cat/plugin-core";
import { ServiceImplementationReferenceSchema } from "@cat/shared";
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

import {
  createDefaultGraphRuntime,
  type DefaultGraphRuntime,
} from "#/graph/index.ts";

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

vi.mock("#/graph/dsl/run-graph.ts", () => ({ runGraph: mocks.nestedRunGraph }));

import { batchAutoTranslateGraph } from "../batch-auto-translate.ts";

const vectorizer = ServiceImplementationReferenceSchema.parse({
  pluginId: "test-plugin",
  serviceId: "vectorizer",
  serviceType: "TEXT_VECTORIZER",
  scopeType: "GLOBAL",
  scopeId: "",
});
const vectorStorage = ServiceImplementationReferenceSchema.parse({
  pluginId: "test-plugin",
  serviceId: "vector-storage",
  serviceType: "VECTOR_STORAGE",
  scopeType: "GLOBAL",
  scopeId: "",
});

describe("batchAutoTranslateGraph", () => {
  let cleanup: TestDB["cleanup"] | undefined;
  let pluginManager: PluginManager;
  let runtime: DefaultGraphRuntime;

  beforeAll(async () => {
    const db = await setupTestDB();
    cleanup = db.cleanup;

    PluginManager.clear();
    pluginManager = PluginManager.get(
      "GLOBAL",
      "batch-auto-translate-spec",
      new TestPluginLoader(),
    );

    runtime = createDefaultGraphRuntime(db.client, pluginManager);
  });

  afterAll(async () => {
    await runtime?.dispose();
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
      typeof import("#/graph/dsl/run-graph.ts")
    >("#/graph/dsl/run-graph.ts");
    const progress: Array<{ current: number; translatedElementIds: number[] }> =
      [];
    const unsubscribe = runtime.eventBus.subscribe(
      "workflow:task:progress",
      (event) => {
        progress.push({
          current: event.payload.current,
          translatedElementIds: event.payload.translatedElementIds,
        });
      },
    );
    const result = await runGraph(
      batchAutoTranslateGraph,
      {
        projectId: "11111111-1111-4111-8111-111111111111",
        contentNodeIds: [],
        elementIds: [1, 2],
        sortMode: "reuse-first",
        languageId: "zh-Hans",
        minMemorySimilarity: 0.72,
        maxMemoryAmount: 3,
        memoryVectorStorage: vectorStorage,
        translationVectorStorage: vectorStorage,
        vectorizer,
        translatorId: "11111111-1111-4111-8111-111111111111",
        memoryIds: [],
        glossaryIds: [],
        config: { gatherScopeContext: true },
      },
      { pluginManager },
    );
    unsubscribe();

    expect(mocks.resolveOperationScopeElementsOp).toHaveBeenCalledWith(
      expect.objectContaining({
        sortMode: "reuse-first",
        contentNodeIds: [],
        elementIds: [1, 2],
        statusFilter: "all",
        exactElementIds: true,
      }),
      expect.any(Object),
    );
    expect(mocks.nestedRunGraph.mock.calls[1]?.[1]).toMatchObject({
      translatableElementId: 2,
      scopeTranslationSeeds: [
        expect.objectContaining({ source: "Checkout", translation: "结账" }),
      ],
    });
    expect(result).toEqual({
      translationIds: [101, 102],
      translatedElementIds: [1, 2],
      skippedElementIds: [],
    });
    expect(progress).toEqual([
      { current: 1, translatedElementIds: [1] },
      { current: 2, translatedElementIds: [1, 2] },
    ]);
  });

  it("does not reinterpret an empty persisted element snapshot as a project scope", async () => {
    const { runGraph } = await vi.importActual<
      typeof import("#/graph/dsl/run-graph.ts")
    >("#/graph/dsl/run-graph.ts");
    const result = await runGraph(
      batchAutoTranslateGraph,
      {
        projectId: "11111111-1111-4111-8111-111111111111",
        contentNodeIds: [],
        elementIds: [],
        sortMode: "structure",
        languageId: "zh-Hans",
        minMemorySimilarity: 0.72,
        maxMemoryAmount: 3,
        memoryVectorStorage: vectorStorage,
        translationVectorStorage: vectorStorage,
        vectorizer,
        translatorId: "11111111-1111-4111-8111-111111111111",
        memoryIds: [],
        glossaryIds: [],
      },
      { pluginManager },
    );

    expect(mocks.resolveOperationScopeElementsOp).not.toHaveBeenCalled();
    expect(mocks.nestedRunGraph).not.toHaveBeenCalled();
    expect(result).toEqual({
      translationIds: [],
      translatedElementIds: [],
      skippedElementIds: [],
    });
  });

  it("replays the complete exact snapshot after an element commit and reports the original total", async () => {
    const { runGraph } = await vi.importActual<
      typeof import("#/graph/dsl/run-graph.ts")
    >("#/graph/dsl/run-graph.ts");
    mocks.nestedRunGraph.mockReset();
    mocks.nestedRunGraph
      .mockResolvedValueOnce({ translationIds: [101] })
      .mockRejectedValueOnce(new Error("process crashed after element commit"))
      // The nested durable phase returns the original ID even if regeneration
      // produced different text; the domain command test covers that write.
      .mockResolvedValueOnce({ translationIds: [101] })
      .mockResolvedValueOnce({ translationIds: [102] });
    const progress: Array<{
      current: number;
      total: number;
      translatedElementIds: number[];
    }> = [];
    const unsubscribe = runtime.eventBus.subscribe(
      "workflow:task:progress",
      (event) => {
        progress.push({
          current: event.payload.current,
          total: event.payload.total,
          translatedElementIds: event.payload.translatedElementIds,
        });
      },
    );
    const invocation = {
      projectId: "11111111-1111-4111-8111-111111111111",
      contentNodeIds: [],
      elementIds: [1, 2],
      sortMode: "structure" as const,
      languageId: "zh-Hans",
      minMemorySimilarity: 0.72,
      maxMemoryAmount: 3,
      memoryVectorStorage: vectorStorage,
      translationVectorStorage: vectorStorage,
      vectorizer,
      translatorId: "11111111-1111-4111-8111-111111111111",
      memoryIds: [],
      glossaryIds: [],
    };

    await expect(
      runGraph(batchAutoTranslateGraph, invocation, { pluginManager }),
    ).rejects.toThrow("process crashed after element commit");
    const recovered = await runGraph(batchAutoTranslateGraph, invocation, {
      pluginManager,
    });
    unsubscribe();

    expect(recovered).toEqual({
      translationIds: [101, 102],
      translatedElementIds: [1, 2],
      skippedElementIds: [],
    });
    expect(progress).toEqual([
      { current: 1, total: 2, translatedElementIds: [1] },
      { current: 1, total: 2, translatedElementIds: [1] },
      { current: 2, total: 2, translatedElementIds: [1, 2] },
    ]);
  });

  it("does not forward low-confidence or unrelated cross-node seeds", async () => {
    const { runGraph } = await vi.importActual<
      typeof import("#/graph/dsl/run-graph.ts")
    >("#/graph/dsl/run-graph.ts");
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
        elementIds: [1, 2],
        sortMode: "reuse-first",
        languageId: "zh-Hans",
        minMemorySimilarity: 0.72,
        maxMemoryAmount: 3,
        memoryVectorStorage: vectorStorage,
        translationVectorStorage: vectorStorage,
        vectorizer,
        translatorId: "11111111-1111-4111-8111-111111111111",
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

  it("preserves a typed handler failure through the batch run", async () => {
    const { runGraph } = await vi.importActual<
      typeof import("#/graph/dsl/run-graph.ts")
    >("#/graph/dsl/run-graph.ts");
    const operationFailure = {
      code: "CAT_OPERATION_DEPENDENCY_UNAVAILABLE" as const,
      message: "Language analysis is unavailable.",
      severity: "ERROR" as const,
      retryable: true,
      blocker: "language_analysis_unavailable" as const,
      capability: "LANGUAGE_ANALYSIS" as const,
      affectedResources: [{ type: "ELEMENT" as const, id: "1" }],
      remediationHint: "Restore the configured analyzer.",
      redactionBoundary: "PUBLIC" as const,
    };
    mocks.resolveOperationScopeElementsOp.mockResolvedValueOnce({
      elements: [
        {
          id: 1,
          value: "Checkout",
          languageId: "en",
          primaryContentNodeId: null,
          chunkIds: [],
        },
      ],
    });
    mocks.nestedRunGraph.mockReset();
    mocks.nestedRunGraph.mockRejectedValueOnce(
      Object.assign(new Error(operationFailure.message), { operationFailure }),
    );

    const result = runGraph(
      batchAutoTranslateGraph,
      {
        projectId: "11111111-1111-4111-8111-111111111111",
        contentNodeIds: [],
        elementIds: [1],
        sortMode: "structure",
        languageId: "zh-Hans",
        minMemorySimilarity: 0.72,
        maxMemoryAmount: 3,
        memoryVectorStorage: vectorStorage,
        translationVectorStorage: vectorStorage,
        vectorizer,
        translatorId: "11111111-1111-4111-8111-111111111111",
        memoryIds: [],
        glossaryIds: [],
      },
      { pluginManager },
    );

    await expect(result).rejects.toMatchObject({
      message: expect.stringContaining("Element 1"),
      operationFailure,
    });
  });
});
