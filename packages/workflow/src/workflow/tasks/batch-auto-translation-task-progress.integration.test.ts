import { randomUUID } from "node:crypto";

import {
  createContentNodeUnderParent,
  createElements,
  createProject,
  createRootContentNode,
  createUser,
  createVectorizedStrings,
  ensureCoreRelationTypes,
  ensureLanguages,
  executeCommand,
} from "@cat/domain";
import { PluginManager } from "@cat/plugin-core";
import { BatchAutoTranslationInvocationSchema } from "@cat/shared";
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

import type { DefaultGraphRuntime } from "#/graph/index.ts";
import {
  cleanupTestGraphFixture,
  createTestGraphRuntime,
  type TestGraphRuntimeFixture,
} from "#/graph/testing/test-graph-runtime.ts";

const mocks = vi.hoisted(() => ({
  nestedRunGraph: vi.fn(),
  resolveOperationScopeElementsOp: vi.fn(),
}));

vi.mock("@cat/operations", async () => {
  const actual =
    await vi.importActual<typeof import("@cat/operations")>("@cat/operations");
  return {
    ...actual,
    resolveOperationScopeElementsOp: mocks.resolveOperationScopeElementsOp,
  };
});

// Keep the outer batch graph real while isolating the per-element graph.
vi.mock("#/graph/dsl/run-graph.ts", () => ({
  runGraph: mocks.nestedRunGraph,
}));

import { BatchAutoTranslationTaskAdapter } from "./batch-auto-translation-task-adapter.ts";

const serviceReference = (
  serviceType: "VECTOR_STORAGE" | "TEXT_VECTORIZER",
) => ({
  pluginId:
    serviceType === "VECTOR_STORAGE" ? "test.vector" : "test.vectorizer",
  serviceId: "default",
  serviceType,
  scopeType: "GLOBAL" as const,
  scopeId: "" as const,
});

describe("batch auto-translation Task progress", () => {
  let db: TestDB | undefined;
  let runtime: DefaultGraphRuntime | undefined;
  let runtimeFixture: TestGraphRuntimeFixture | undefined;

  beforeAll(async () => {
    db = await setupTestDB();
    await executeCommand({ db: db.client }, ensureCoreRelationTypes, {});
    await executeCommand({ db: db.client }, ensureLanguages, {
      languageIds: ["en", "zh-Hans"],
    });
    PluginManager.clear();
    const pluginManager = PluginManager.get(
      "GLOBAL",
      "batch-auto-translation-task-progress",
      new TestPluginLoader(),
    );
    runtimeFixture = createTestGraphRuntime(db, pluginManager);
    runtime = runtimeFixture.runtime;
  }, 30_000);

  afterAll(async () => {
    PluginManager.clear();
    await cleanupTestGraphFixture(runtimeFixture, db);
  }, 30_000);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("projects actual graph progress from unknown to known before the terminal task state", async () => {
    if (!db || !runtime) throw new Error("Test runtime was not initialized.");
    const user = await executeCommand({ db: db.client }, createUser, {
      email: `${randomUUID()}@example.com`,
      name: "Batch progress worker",
    });
    const project = await executeCommand({ db: db.client }, createProject, {
      name: "Batch progress project",
      description: null,
      creatorId: user.id,
    });
    const root = await executeCommand(
      { db: db.client },
      createRootContentNode,
      { projectId: project.id, creatorId: user.id },
    );
    const source = await executeCommand(
      { db: db.client },
      createContentNodeUnderParent,
      {
        projectId: project.id,
        creatorId: user.id,
        parentContentNodeId: root.id,
        kind: "FILE",
        displayLabel: "batch-progress.json",
        importerId: "test-json",
        sourceRootRef: "batch-progress",
        stableSourceNodeRef: `batch-progress-${randomUUID()}`,
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
          { text: "First", languageId: "en" },
          { text: "Second", languageId: "en" },
        ],
      },
    );
    const elementIds = await executeCommand({ db: db.client }, createElements, {
      data: stringIds.map((stringId, index) => ({
        projectId: project.id,
        primaryContentNodeId: source.id,
        importerId: "test-json",
        sourceRootRef: "batch-progress",
        sourceNodeRef: `element-${index}`,
        stableSourceRef: `element-${index}-${randomUUID()}`,
        stringId,
        creatorId: user.id,
        localOrder: index,
      })),
    });
    const [firstElementId, secondElementId] = elementIds;
    if (firstElementId === undefined || secondElementId === undefined) {
      throw new Error("Expected two persisted batch elements.");
    }
    let releaseSecondTranslation = (): void => {};
    const secondTranslation = new Promise<void>((resolve) => {
      releaseSecondTranslation = resolve;
    });
    mocks.resolveOperationScopeElementsOp.mockResolvedValue({
      elements: [
        {
          id: firstElementId,
          value: "First",
          languageId: "en",
          primaryContentNodeId: source.id,
          chunkIds: [],
        },
        {
          id: secondElementId,
          value: "Second",
          languageId: "en",
          primaryContentNodeId: source.id,
          chunkIds: [],
        },
      ],
    });
    mocks.nestedRunGraph
      .mockResolvedValueOnce({ translationIds: [1001] })
      .mockImplementationOnce(async () => {
        await secondTranslation;
        return { translationIds: [1002] };
      });

    const adapter = await BatchAutoTranslationTaskAdapter.create({
      db: db.client,
      actorId: user.id,
      invocation: BatchAutoTranslationInvocationSchema.parse({
        projectId: project.id,
        contentNodeIds: [],
        elementIds,
        sortMode: "structure",
        languageId: "zh-Hans",
        minMemorySimilarity: 0.72,
        maxMemoryAmount: 3,
        memoryVectorStorage: serviceReference("VECTOR_STORAGE"),
        translationVectorStorage: serviceReference("VECTOR_STORAGE"),
        vectorizer: serviceReference("TEXT_VECTORIZER"),
        translatorId: user.id,
        memoryIds: [],
        glossaryIds: [],
      }),
    });
    expect(adapter.task.state.progressCurrent).toBeNull();
    expect(adapter.task.state.progressTotal).toBeNull();

    const progressEvents: Array<{ current: number; total: number }> = [];
    const unsubscribe = runtime.eventBus.subscribe(
      "workflow:task:progress",
      (event) => {
        progressEvents.push({
          current: event.payload.current,
          total: event.payload.total,
        });
      },
    );
    try {
      await runtime.taskService.reconcilePending();
      await vi.waitFor(() => {
        expect(progressEvents).toEqual([{ current: 1, total: 2 }]);
      });
      await vi.waitFor(async () => {
        const running = await adapter.refresh();
        expect(running.state.status).toBe("RUNNING");
        expect(running.state.progressCurrent).toBe(1);
        expect(running.state.progressTotal).toBe(2);
      });

      releaseSecondTranslation();
      await vi.waitFor(async () => {
        const completed = await adapter.refresh();
        expect(completed.state.status).toBe("COMPLETED");
        expect(completed.state.progressCurrent).toBe(2);
        expect(completed.state.progressTotal).toBe(2);
        expect(completed.state.runtime.result).toEqual({
          translationIds: [1001, 1002],
          translatedElementIds: elementIds,
          skippedElementIds: [],
        });
      });
      expect(mocks.resolveOperationScopeElementsOp).toHaveBeenCalledWith(
        expect.objectContaining({
          projectId: project.id,
          elementIds,
          exactElementIds: true,
        }),
        expect.any(Object),
      );
      expect(mocks.nestedRunGraph.mock.calls[0]?.[1]).toMatchObject({
        translatableElementId: firstElementId,
        primaryContentNodeId: source.id,
      });
      expect(mocks.nestedRunGraph.mock.calls[1]?.[1]).toMatchObject({
        translatableElementId: secondElementId,
        primaryContentNodeId: source.id,
      });
    } finally {
      releaseSecondTranslation();
      unsubscribe();
    }
  });
});
