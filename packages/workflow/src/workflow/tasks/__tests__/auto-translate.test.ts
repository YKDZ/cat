import { randomUUID } from "node:crypto";

import {
  createAgentDefinition,
  createAgentRun,
  createAgentSession,
  createContentNodeUnderParent,
  createElements,
  createProject,
  createRootContentNode,
  createTranslations,
  createUser,
  createVectorizedStrings,
  ensureCoreRelationTypes,
  ensureLanguages,
  executeCommand,
} from "@cat/domain";
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
  collectMemoryRecallOp: vi.fn(),
  collectTermRecallOp: vi.fn(),
  getTermRecallCandidates: vi.fn(),
  fetchAdviseOp: vi.fn(),
  llmRefineTranslationOp: vi.fn(),
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
    collectTermRecallOp: mocks.collectTermRecallOp,
    getTermRecallCandidates: mocks.getTermRecallCandidates,
  };
});

vi.mock("#/graph/dsl/run-graph.ts", () => ({
  runGraph: mocks.nestedRunGraph,
}));

import { autoTranslateGraph } from "../auto-translate.ts";

const advisor = ServiceImplementationReferenceSchema.parse({
  pluginId: "test-plugin",
  serviceId: "advisor",
  serviceType: "TRANSLATION_ADVISOR",
  scopeType: "GLOBAL",
  scopeId: "",
});
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

describe("autoTranslateGraph", () => {
  let cleanup: TestDB["cleanup"] | undefined;
  let db: TestDB;
  let pluginManager: PluginManager;
  let runtime: DefaultGraphRuntime;

  beforeAll(async () => {
    db = await setupTestDB();
    cleanup = db.cleanup;

    PluginManager.clear();
    pluginManager = PluginManager.get(
      "GLOBAL",
      "auto-translate-test",
      new TestPluginLoader(),
    );

    runtime = createDefaultGraphRuntime(db.client, pluginManager);
    await executeCommand({ db: db.client }, ensureCoreRelationTypes, {});
    await executeCommand({ db: db.client }, ensureLanguages, {
      languageIds: ["en", "zh-Hans"],
    });
  });

  afterAll(async () => {
    await runtime?.dispose();
    PluginManager.clear();
    await cleanup?.();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    const terms = [
      {
        term: "memory bank",
        translation: "记忆库",
        confidence: 0.82,
        definition: null,
        concept: { subjects: [], definition: null },
      },
    ];
    mocks.collectTermRecallOp.mockResolvedValue({});
    mocks.getTermRecallCandidates.mockReturnValue(terms);
    mocks.collectMemoryRecallOp.mockResolvedValue({
      requestedChannels: ["EXACT"],
      outcomes: {
        EXACT: {
          status: "SUCCEEDED",
          candidates: [
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
          ],
        },
        FUZZY: { status: "SKIPPED", reason: "NOT_REQUESTED" },
        KEYWORD: { status: "SKIPPED", reason: "NOT_REQUESTED" },
        VARIANT: { status: "SKIPPED", reason: "NOT_REQUESTED" },
        SEMANTIC: { status: "SKIPPED", reason: "NOT_REQUESTED" },
      },
    });
    mocks.fetchAdviseOp.mockResolvedValue({
      suggestions: [{ translation: "建议译文", confidence: 0.5 }],
    });
    mocks.nestedRunGraph.mockResolvedValue({ translationIds: [99] });
  });

  it("feeds fused recall into MT advise instead of re-querying vector-only memory", async () => {
    const { runGraph } = await vi.importActual<
      typeof import("#/graph/dsl/run-graph.ts")
    >("#/graph/dsl/run-graph.ts");

    const result = await runGraph(
      autoTranslateGraph,
      {
        translatableElementId: 1,
        text: "Order 43 completed",
        translationLanguageId: "zh-Hans",
        sourceLanguageId: "en",
        translatorId: null,
        advisor,
        memoryIds: ["22222222-2222-4222-8222-222222222222"],
        glossaryIds: ["11111111-1111-4111-8111-111111111111"],
        chunkIds: [1],
        minMemorySimilarity: 0.72,
        maxMemoryAmount: 3,
        memoryVectorStorage: vectorStorage,
        translationVectorStorage: vectorStorage,
        vectorizer,
      },
      { pluginManager },
    );

    expect(mocks.collectMemoryRecallOp).toHaveBeenCalledWith(
      expect.objectContaining({
        text: "Order 43 completed",
        vectorStorage,
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
    expect(result).toMatchObject({ translationIds: [99] });
    expect(result.scopeTranslationSeed).toMatchObject({
      elementId: 1,
      source: "Order 43 completed",
      translation: "订单 43 已完成",
      reason: "batch-runtime",
    });
  });

  it("injects runtime scope seeds into advisor memories and LLM neighbor context", async () => {
    const { runGraph } = await vi.importActual<
      typeof import("#/graph/dsl/run-graph.ts")
    >("#/graph/dsl/run-graph.ts");
    mocks.llmRefineTranslationOp.mockResolvedValue({
      refinedText: "请确认订单",
      refined: true,
    });

    const result = await runGraph(
      autoTranslateGraph,
      {
        translatableElementId: 2,
        text: "Confirm order",
        primaryContentNodeId: "11111111-1111-4111-8111-111111111111",
        translationLanguageId: "zh-Hans",
        sourceLanguageId: "en",
        translatorId: null,
        advisor,
        memoryIds: [],
        glossaryIds: [],
        chunkIds: [],
        minMemorySimilarity: 0.72,
        maxMemoryAmount: 3,
        memoryVectorStorage: vectorStorage,
        translationVectorStorage: vectorStorage,
        vectorizer,
        scopeTranslationSeeds: [
          {
            elementId: 1,
            source: "Order",
            translation: "订单",
            sourceLanguageId: "en",
            targetLanguageId: "zh-Hans",
            primaryContentNodeId: "11111111-1111-4111-8111-111111111111",
            confidence: 0.91,
            trustLevel: "HIGH",
            reason: "batch-runtime",
          },
        ],
        config: {
          llm: { enabled: true },
          gatherScopeContext: true,
          highConfidenceThreshold: 0.99,
        },
      },
      { pluginManager },
    );

    expect(mocks.fetchAdviseOp).toHaveBeenCalledWith(
      expect.objectContaining({
        preloadedMemories: expect.arrayContaining([
          { source: "Order", translation: "订单", confidence: 0.91 },
        ]),
      }),
      expect.any(Object),
    );
    expect(mocks.llmRefineTranslationOp).toHaveBeenCalledWith(
      expect.objectContaining({
        neighborTranslations: [{ source: "Order", translation: "订单" }],
      }),
      expect.any(Object),
    );
    expect(result.scopeTranslationSeed).toMatchObject({
      elementId: 2,
      source: "Confirm order",
      translation: "请确认订单",
      confidence: 0.97,
      trustLevel: "HIGH",
      reason: "batch-runtime",
    });
  });

  it("returns the persisted durable outcome before regenerating a candidate", async () => {
    const user = await executeCommand({ db: db.client }, createUser, {
      email: `${randomUUID()}@example.com`,
      name: "Durable outcome worker",
    });
    const project = await executeCommand({ db: db.client }, createProject, {
      name: `durable-outcome-${randomUUID()}`,
      description: null,
      creatorId: user.id,
    });
    const root = await executeCommand(
      { db: db.client },
      createRootContentNode,
      { projectId: project.id, creatorId: user.id },
    );
    const file = await executeCommand(
      { db: db.client },
      createContentNodeUnderParent,
      {
        projectId: project.id,
        creatorId: user.id,
        parentContentNodeId: root.id,
        kind: "FILE",
        displayLabel: "durable.json",
        importerId: "test-json",
        sourceRootRef: "root",
        stableSourceNodeRef: `durable-${randomUUID()}`,
        exportRole: "FILE",
        boundaryType: "FILE",
        localOrder: 0,
      },
    );
    const stringIds = await executeCommand(
      { db: db.client },
      createVectorizedStrings,
      {
        data: [
          { text: "Checkout", languageId: "en" },
          { text: "结账 A", languageId: "zh-Hans" },
        ],
      },
    );
    const [sourceStringId, targetStringId] = stringIds;
    if (sourceStringId === undefined || targetStringId === undefined) {
      throw new Error("Durable outcome strings were not created.");
    }
    const elementIds = await executeCommand({ db: db.client }, createElements, {
      data: [
        {
          projectId: project.id,
          primaryContentNodeId: file.id,
          importerId: "test-json",
          sourceRootRef: "root",
          sourceNodeRef: "checkout",
          stableSourceRef: `checkout-${randomUUID()}`,
          stringId: sourceStringId,
          localOrder: 0,
        },
      ],
    });
    const elementId = elementIds[0];
    if (elementId === undefined) throw new Error("Element was not created.");
    const translationIds = await executeCommand(
      { db: db.client },
      createTranslations,
      {
        data: [
          {
            translatableElementId: elementId,
            translatorId: user.id,
            stringId: targetStringId,
          },
        ],
      },
    );
    const definition = await executeCommand(
      { db: db.client },
      createAgentDefinition,
      {
        name: `durable-outcome-${randomUUID()}`,
        description: "",
        scopeType: "GLOBAL",
        scopeId: "",
        definitionId: `durable-outcome-${randomUUID()}`,
        version: "1.0.0",
        type: "WORKFLOW",
        tools: [],
        content: "",
        isBuiltin: false,
      },
    );
    const session = await executeCommand(
      { db: db.client },
      createAgentSession,
      { agentDefinitionId: definition.id, userId: user.id },
    );
    const run = await executeCommand({ db: db.client }, createAgentRun, {
      sessionId: session.sessionId,
      graphDefinition: autoTranslateGraph.graphDefinition,
    });
    await runtime.checkpointer.saveExternalOutput({
      runId: run.runId,
      nodeId: "main",
      outputType: "db_write",
      outputKey: `owned-element-write:${elementId}`,
      idempotencyKey: `main:${run.runId}:owned-element-write:${elementId}`,
      payload: {
        translationIds,
        durableOutcomes: [
          {
            translatableElementId: elementId,
            scopeTranslationSeed: {
              elementId,
              source: "Checkout",
              translation: "regenerated B",
              sourceLanguageId: "en",
              targetLanguageId: "zh-Hans",
              primaryContentNodeId: file.id,
              confidence: 0.92,
              trustLevel: "HIGH",
              reason: "batch-runtime",
            },
          },
        ],
      },
      createdAt: new Date().toISOString(),
    });
    mocks.fetchAdviseOp.mockResolvedValue({ suggestions: [] });

    const { runGraph } = await vi.importActual<
      typeof import("#/graph/dsl/run-graph.ts")
    >("#/graph/dsl/run-graph.ts");
    const result = await runGraph(
      autoTranslateGraph,
      {
        translatableElementId: elementId,
        text: "Checkout",
        primaryContentNodeId: file.id,
        translationLanguageId: "zh-Hans",
        sourceLanguageId: "en",
        translatorId: user.id,
        advisor,
        memoryIds: [],
        glossaryIds: [],
        chunkIds: [],
        minMemorySimilarity: 0.72,
        maxMemoryAmount: 3,
        memoryVectorStorage: vectorStorage,
        translationVectorStorage: vectorStorage,
        vectorizer,
      },
      {
        pluginManager,
        ownershipFence: {
          runId: run.runId,
          ownerId: randomUUID(),
          epoch: 1,
        },
        assertRunOwnership: async () => undefined,
      },
    );

    expect(result).toMatchObject({
      translationIds,
      scopeTranslationSeed: { translation: "结账 A", confidence: 0.92 },
    });
    expect(mocks.collectTermRecallOp).not.toHaveBeenCalled();
    expect(mocks.collectMemoryRecallOp).not.toHaveBeenCalled();
    expect(mocks.fetchAdviseOp).not.toHaveBeenCalled();
    expect(mocks.llmRefineTranslationOp).not.toHaveBeenCalled();
    expect(mocks.nestedRunGraph).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        data: [expect.objectContaining({ text: "结账 A" })],
      }),
      expect.any(Object),
    );
  });
});
