import { randomUUID } from "node:crypto";

import {
  createAgentDefinition,
  createAgentRun,
  createAgentSession,
  createContentNodeUnderParent,
  createElements,
  activateWorkflowTaskDispatch,
  bindWorkflowTaskDispatchSession,
  claimWorkflowTaskDispatch,
  createProject,
  createRootContentNode,
  createUser,
  createVectorizedStrings,
  ensureCoreRelationTypes,
  ensureLanguages,
  executeCommand,
  executeQuery,
  findAgentDefinitionByNameAndScope,
  getAgentSessionByExternalId,
  loadAgentRunMetadata,
  getLatestWorkflowTaskDispatch,
  getLocalizationTaskForWorkflow,
  getOperationFailure,
  projectWorkflowTaskDispatchEvent,
  renewWorkflowTaskDispatch,
  requestWorkflowTaskDispatchCancel,
} from "@cat/domain";
import { PluginManager } from "@cat/plugin-core";
import { BatchAutoTranslationInvocationSchema } from "@cat/shared";
import {
  sql,
  TestPluginLoader,
  setupTestDB,
  type TestDB,
} from "@cat/test-utils";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { createAgentEvent } from "#/graph/events.ts";
import {
  createDefaultGraphRuntime,
  type DefaultGraphRuntime,
} from "#/graph/index.ts";

import { batchAutoTranslateGraph } from "./batch-auto-translate.ts";
import { BatchAutoTranslationTaskAdapter } from "./batch-auto-translation-task-adapter.ts";

let db: TestDB | undefined;
let runtime: DefaultGraphRuntime | undefined;
let createdTaskIds = new Set<string>();

beforeAll(async () => {
  db = await setupTestDB();
  PluginManager.clear();
  const pluginManager = PluginManager.get(
    "GLOBAL",
    "task-projector-test",
    new TestPluginLoader(),
  );
  runtime = createDefaultGraphRuntime(db.client, pluginManager, {
    startReconciliationLoops: false,
  });
}, 30_000);

afterAll(async () => {
  await runtime?.dispose();
  PluginManager.clear();
  await db?.cleanup();
}, 30_000);

beforeEach(() => {
  createdTaskIds = new Set();
});

afterEach(async () => {
  if (!db) return;
  for (const taskId of createdTaskIds) {
    await db.client.execute(sql`
      UPDATE "WorkflowTaskDispatch"
      SET status = 'SETTLED', settled_at = clock_timestamp()
      WHERE task_id = ${taskId}
    `);
  }
});

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

const bindRunningTask = async (
  adapter: BatchAutoTranslationTaskAdapter,
  leaseDurationMs = 30_000,
  ownerRuntime?: DefaultGraphRuntime,
): Promise<string> => {
  if (!db) throw new Error("Test database was not initialized.");
  const activeRuntime = ownerRuntime ?? runtime;
  const task = await adapter.refresh();
  const definition = await executeCommand(
    { db: db.client },
    createAgentDefinition,
    {
      name: `binding-${randomUUID()}`,
      description: "Projection binding",
      scopeType: "GLOBAL",
      scopeId: "",
      definitionId: `binding-${randomUUID()}`,
      version: "1.0.0",
      type: "WORKFLOW",
      tools: [],
      content: "",
      isBuiltin: true,
    },
  );
  const session = await executeCommand({ db: db.client }, createAgentSession, {
    agentDefinitionId: definition.id,
    userId: task.state.actor.id ?? "",
    projectId: task.task.payload.invocation.projectId,
    metadata: {},
  });
  const sessionRow = await executeQuery(
    { db: db.client },
    getAgentSessionByExternalId,
    { externalId: session.sessionId },
  );
  if (!sessionRow) throw new Error("Agent session missing.");
  const binding = await executeQuery(
    { db: db.client },
    getLatestWorkflowTaskDispatch,
    { taskId: task.id },
  );
  if (!binding) throw new Error("Workflow dispatch missing.");
  await executeCommand({ db: db.client }, createAgentRun, {
    externalId: binding.runId,
    sessionId: session.sessionId,
    graphDefinition: batchAutoTranslateGraph.graphDefinition,
  });
  if (
    !activeRuntime ||
    !(await activeRuntime.checkpointer.claimRunOwnership(binding.runId))
  ) {
    throw new Error("Workflow run was not claimed.");
  }
  const fence = activeRuntime.checkpointer.getRunOwnershipFence(binding.runId);
  if (!fence) throw new Error("Workflow run ownership fence is missing.");
  const claimed = await executeCommand(
    { db: db.client },
    claimWorkflowTaskDispatch,
    {
      dispatchId: binding.id,
      ownerId: fence.ownerId,
      leaseDurationMs,
    },
  );
  if (!claimed) throw new Error("Workflow dispatch was not claimed.");
  const owned = await executeCommand(
    { db: db.client },
    bindWorkflowTaskDispatchSession,
    {
      dispatchId: claimed.id,
      ownerId: claimed.ownerId ?? "",
      ownerEpoch: claimed.ownerEpoch,
      agentSessionId: sessionRow.id,
    },
  );
  await executeCommand({ db: db.client }, activateWorkflowTaskDispatch, {
    dispatchId: owned.id,
    dispatchFence: { ownerId: owned.ownerId ?? "", epoch: owned.ownerEpoch },
    runFence: { ownerId: fence.ownerId, epoch: fence.epoch },
    requestId: randomUUID(),
  });
  return claimed.runId;
};

const createTrackedTaskAdapter = async (
  input: Parameters<typeof BatchAutoTranslationTaskAdapter.create>[0],
) => {
  const adapter = await BatchAutoTranslationTaskAdapter.create(input);
  createdTaskIds.add(adapter.task.id);
  return adapter;
};

const createTaskAdapter = async (input: {
  actorId: string;
  projectId: string;
}) => {
  if (!db) throw new Error("Test database was not initialized.");
  return await createTrackedTaskAdapter({
    db: db.client,
    actorId: input.actorId,
    invocation: BatchAutoTranslationInvocationSchema.parse({
      projectId: input.projectId,
      contentNodeIds: [],
      elementIds: [],
      sortMode: "structure",
      languageId: "zh-Hans",
      minMemorySimilarity: 0.72,
      maxMemoryAmount: 3,
      memoryVectorStorage: serviceReference("VECTOR_STORAGE"),
      translationVectorStorage: serviceReference("VECTOR_STORAGE"),
      vectorizer: serviceReference("TEXT_VECTORIZER"),
      translatorId: input.actorId,
      memoryIds: [],
      glossaryIds: [],
    }),
  });
};

const saveCancelledRunMetadata = async (
  activeRuntime: DefaultGraphRuntime,
  runId: string,
): Promise<void> => {
  const timestamp = new Date().toISOString();
  await activeRuntime.checkpointer.saveRunMetadata(runId, {
    graphId: batchAutoTranslateGraph.id,
    status: "cancelled",
    startedAt: timestamp,
    completedAt: timestamp,
    graphDefinition: batchAutoTranslateGraph.graphDefinition,
  });
};

describe("WorkflowTaskProjector", () => {
  it("creates exact affected element resources for a nonempty invocation", async () => {
    if (!db) throw new Error("Test database was not initialized.");
    await executeCommand({ db: db.client }, ensureLanguages, {
      languageIds: ["en", "zh-Hans"],
    });
    await executeCommand({ db: db.client }, ensureCoreRelationTypes, {});
    const user = await executeCommand({ db: db.client }, createUser, {
      email: `${randomUUID()}@example.com`,
      name: "Element resource worker",
    });
    const project = await executeCommand({ db: db.client }, createProject, {
      name: "Element resource project",
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
        displayLabel: "source.json",
        importerId: "test-json",
        sourceRootRef: "root",
        stableSourceNodeRef: `source-${randomUUID()}`,
        exportRole: "FILE",
        boundaryType: "FILE",
        localOrder: 0,
      },
    );
    const stringIds = await executeCommand(
      { db: db.client },
      createVectorizedStrings,
      { data: [{ text: `source-${randomUUID()}`, languageId: "en" }] },
    );
    const stringId = stringIds[0];
    if (stringId === undefined) throw new Error("Source string missing.");
    const elementIds = await executeCommand({ db: db.client }, createElements, {
      data: [0, 1].map((index) => ({
        projectId: project.id,
        primaryContentNodeId: source.id,
        importerId: "test-json",
        sourceRootRef: "root",
        sourceNodeRef: "source.json",
        stableSourceRef: `element-${index}-${randomUUID()}`,
        stringId,
      })),
    });
    const firstElementId = elementIds[0];
    const secondElementId = elementIds[1];
    if (firstElementId === undefined || secondElementId === undefined) {
      throw new Error("Source elements missing.");
    }

    const adapter = await createTrackedTaskAdapter({
      db: db.client,
      actorId: user.id,
      invocation: BatchAutoTranslationInvocationSchema.parse({
        projectId: project.id,
        contentNodeIds: [],
        elementIds: [secondElementId, firstElementId, secondElementId],
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

    expect(adapter.task.state.resources).toEqual([
      { type: "PROJECT", id: project.id },
      { type: "ELEMENT", id: String(secondElementId) },
      { type: "ELEMENT", id: String(firstElementId) },
    ]);
  });

  it("replays same-timestamp progress before terminal by persisted sequence", async () => {
    if (!db || !runtime) throw new Error("Test runtime was not initialized.");
    const user = await executeCommand({ db: db.client }, createUser, {
      email: `${randomUUID()}@example.com`,
      name: "Projection worker",
    });
    const project = await executeCommand({ db: db.client }, createProject, {
      name: "Projection project",
      description: null,
      creatorId: user.id,
    });
    const projectId = project.id;
    const adapter = await createTrackedTaskAdapter({
      db: db.client,
      actorId: user.id,
      invocation: BatchAutoTranslationInvocationSchema.parse({
        projectId,
        contentNodeIds: [],
        elementIds: [],
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
    const runId = await bindRunningTask(adapter);

    await executeCommand({ db: db.client }, createAgentDefinition, {
      name: `projector-${randomUUID()}`,
      description: "Projection test",
      scopeType: "GLOBAL",
      scopeId: "",
      definitionId: `projector-${randomUUID()}`,
      version: "1.0.0",
      type: "WORKFLOW",
      tools: [],
      content: "",
      isBuiltin: true,
    });
    const definition = await executeQuery(
      { db: db.client },
      findAgentDefinitionByNameAndScope,
      {
        name: "auto-translate",
        scopeType: "GLOBAL",
        scopeId: "",
        isBuiltin: true,
      },
    );
    const ensuredDefinition =
      definition ??
      (await executeQuery(
        { db: db.client },
        findAgentDefinitionByNameAndScope,
        {
          name: "auto-translate",
          scopeType: "GLOBAL",
          scopeId: "",
          isBuiltin: true,
        },
      ));
    if (!ensuredDefinition) {
      await executeCommand({ db: db.client }, createAgentDefinition, {
        name: "auto-translate",
        description: "Projection test",
        scopeType: "GLOBAL",
        scopeId: "",
        definitionId: "auto-translate",
        version: "1.0.0",
        type: "WORKFLOW",
        tools: [],
        content: "",
        isBuiltin: true,
      });
    }
    const autoDefinition = await executeQuery(
      { db: db.client },
      findAgentDefinitionByNameAndScope,
      {
        name: "auto-translate",
        scopeType: "GLOBAL",
        scopeId: "",
        isBuiltin: true,
      },
    );
    if (!autoDefinition) throw new Error("Agent definition missing.");
    const session = await executeCommand(
      { db: db.client },
      createAgentSession,
      {
        agentDefinitionId: autoDefinition.externalId,
        userId: user.id,
        projectId,
        metadata: {},
      },
    );
    const sessionRow = await executeQuery(
      { db: db.client },
      getAgentSessionByExternalId,
      { externalId: session.sessionId },
    );
    if (!sessionRow) throw new Error("Agent session missing.");

    const timestamp = new Date().toISOString();
    const progress = createAgentEvent({
      eventId: randomUUID(),
      runId,
      type: "workflow:task:progress",
      timestamp,
      payload: {
        current: 1,
        total: 1,
        phase: "TRANSLATING",
        translationIds: [41],
        translatedElementIds: [7],
        skippedElementIds: [],
      },
    });
    const terminalBlackboard = {
      "translate-all": {
        translationIds: [41],
        translatedElementIds: [7],
        skippedElementIds: [],
      },
    };
    const terminal = createAgentEvent({
      eventId: randomUUID(),
      runId,
      type: "run:end",
      timestamp,
      payload: {
        status: "completed",
        blackboard: terminalBlackboard,
      },
    });
    expect(await runtime.checkpointer.claimRunOwnership(runId)).toBe(true);
    await runtime.checkpointer.saveSnapshot(runId, {
      runId,
      version: 1,
      data: terminalBlackboard,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    await runtime.checkpointer.saveRunMetadata(runId, {
      graphId: batchAutoTranslateGraph.id,
      status: "running",
      startedAt: timestamp,
      graphDefinition: batchAutoTranslateGraph.graphDefinition,
      metadata: {
        sessionId: sessionRow.id,
        localizationTaskId: adapter.task.id,
      },
    });
    await runtime.taskProjector.projectEvent(progress);
    await runtime.checkpointer.saveEvent(terminal);
    await runtime.checkpointer.saveRunMetadata(runId, {
      graphId: batchAutoTranslateGraph.id,
      status: "completed",
      startedAt: timestamp,
      completedAt: timestamp,
      graphDefinition: batchAutoTranslateGraph.graphDefinition,
      metadata: {
        sessionId: sessionRow.id,
        localizationTaskId: adapter.task.id,
      },
    });

    await runtime.taskProjector.reconcile();
    const projected = await adapter.refresh();
    expect(projected.state.status).toBe("COMPLETED");
    expect(projected.state.progressCurrent).toBe(1);
    expect(projected.state.runtime.result).toEqual({
      translationIds: [41],
      translatedElementIds: [7],
      skippedElementIds: [],
    });
    expect(projected.state.runtime).toMatchObject({ phase: "TRANSLATING" });
  });

  it("synthesizes a completed terminal after persisted progress without a run:end event", async () => {
    if (!db || !runtime) throw new Error("Test runtime was not initialized.");
    const user = await executeCommand({ db: db.client }, createUser, {
      email: `${randomUUID()}@example.com`,
      name: "Synthesized terminal worker",
    });
    const project = await executeCommand({ db: db.client }, createProject, {
      name: "Synthesized terminal project",
      description: null,
      creatorId: user.id,
    });
    const adapter = await createTrackedTaskAdapter({
      db: db.client,
      actorId: user.id,
      invocation: BatchAutoTranslationInvocationSchema.parse({
        projectId: project.id,
        contentNodeIds: [],
        elementIds: [],
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
    const runId = await bindRunningTask(adapter);
    const timestamp = new Date().toISOString();
    const blackboard = {
      "translate-all": {
        translationIds: [51],
        translatedElementIds: [17],
        skippedElementIds: [],
      },
    };
    expect(await runtime.checkpointer.claimRunOwnership(runId)).toBe(true);
    const progressSequence = await runtime.checkpointer.saveEvent(
      createAgentEvent({
        eventId: randomUUID(),
        runId,
        type: "workflow:task:progress",
        timestamp,
        payload: {
          current: 1,
          total: 1,
          phase: "TRANSLATING",
          translationIds: [51],
          translatedElementIds: [17],
          skippedElementIds: [],
        },
      }),
    );
    if (progressSequence === null) throw new Error("Progress event missing.");
    await runtime.checkpointer.saveSnapshot(runId, {
      runId,
      version: 1,
      data: blackboard,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    await runtime.checkpointer.saveRunMetadata(runId, {
      graphId: batchAutoTranslateGraph.id,
      status: "completed",
      startedAt: timestamp,
      completedAt: timestamp,
      graphDefinition: batchAutoTranslateGraph.graphDefinition,
    });

    await runtime.taskProjector.reconcile();

    const projected = await adapter.refresh();
    const dispatch = await executeQuery(
      { db: db.client },
      getLatestWorkflowTaskDispatch,
      { taskId: adapter.task.id },
    );
    expect(projected.state.status).toBe("COMPLETED");
    expect(dispatch).toMatchObject({
      status: "SETTLED",
      lastProjectedEventSequence: progressSequence + 1,
    });
  });

  it("settles cancelled replay after stale progress and advances the cursor once", async () => {
    if (!db || !runtime) throw new Error("Test runtime was not initialized.");
    const user = await executeCommand({ db: db.client }, createUser, {
      email: `${randomUUID()}@example.com`,
      name: "Cancelled replay worker",
    });
    const project = await executeCommand({ db: db.client }, createProject, {
      name: "Cancelled replay project",
      description: null,
      creatorId: user.id,
    });
    const adapter = await createTrackedTaskAdapter({
      db: db.client,
      actorId: user.id,
      invocation: BatchAutoTranslationInvocationSchema.parse({
        projectId: project.id,
        contentNodeIds: [],
        elementIds: [],
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
    const runId = await bindRunningTask(adapter);
    const timestamp = new Date().toISOString();
    const progress = createAgentEvent({
      eventId: randomUUID(),
      runId,
      type: "workflow:task:progress",
      timestamp,
      payload: {
        current: 1,
        total: 2,
        phase: "TRANSLATING",
        translationIds: [],
        translatedElementIds: [],
        skippedElementIds: [],
      },
    });
    const progressSequence = await runtime.checkpointer.saveEvent(progress);
    if (progressSequence === null) throw new Error("Progress event missing.");
    await executeCommand({ db: db.client }, requestWorkflowTaskDispatchCancel, {
      taskId: adapter.task.id,
      requestId: randomUUID(),
    });
    await runtime.taskProjector.projectEvent(progress);
    const terminal = createAgentEvent({
      eventId: randomUUID(),
      runId,
      type: "run:end",
      timestamp,
      payload: { status: "cancelled" },
    });
    const terminalSequence = await runtime.checkpointer.saveEvent(terminal);
    expect(await runtime.checkpointer.claimRunOwnership(runId)).toBe(true);
    await runtime.checkpointer.saveRunMetadata(runId, {
      graphId: batchAutoTranslateGraph.id,
      status: "cancelled",
      startedAt: timestamp,
      completedAt: timestamp,
      graphDefinition: batchAutoTranslateGraph.graphDefinition,
    });
    await runtime.taskProjector.projectEvent(terminal);
    await runtime.taskProjector.projectEvent(terminal);

    const projected = await adapter.refresh();
    const dispatch = await executeQuery(
      { db: db.client },
      getLatestWorkflowTaskDispatch,
      { taskId: adapter.task.id },
    );
    expect(projected.state.status).toBe("CANCELED");
    expect(dispatch).toMatchObject({
      status: "SETTLED",
      lastProjectedEventSequence: terminalSequence,
    });
    expect(terminalSequence).toBeGreaterThan(progressSequence);
  });

  it("synthesizes cancelled metadata without a run:end event at the next cursor", async () => {
    if (!db || !runtime) throw new Error("Test runtime was not initialized.");
    const user = await executeCommand({ db: db.client }, createUser, {
      email: `${randomUUID()}@example.com`,
      name: "Cancelled metadata recovery worker",
    });
    const project = await executeCommand({ db: db.client }, createProject, {
      name: "Cancelled metadata recovery project",
      description: null,
      creatorId: user.id,
    });
    const adapter = await createTrackedTaskAdapter({
      db: db.client,
      actorId: user.id,
      invocation: BatchAutoTranslationInvocationSchema.parse({
        projectId: project.id,
        contentNodeIds: [],
        elementIds: [],
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
    const runId = await bindRunningTask(adapter);
    const binding = await executeQuery(
      { db: db.client },
      getLatestWorkflowTaskDispatch,
      { taskId: adapter.task.id },
    );
    if (!binding) throw new Error("Workflow dispatch is missing.");
    const timestamp = new Date().toISOString();
    await runtime.checkpointer.saveRunMetadata(runId, {
      graphId: batchAutoTranslateGraph.id,
      status: "cancelled",
      startedAt: timestamp,
      completedAt: timestamp,
      graphDefinition: batchAutoTranslateGraph.graphDefinition,
    });

    await runtime.taskProjector.reconcile();

    const projected = await adapter.refresh();
    const settled = await executeQuery(
      { db: db.client },
      getLatestWorkflowTaskDispatch,
      { taskId: adapter.task.id },
    );
    expect(projected.state.status).toBe("CANCELED");
    expect(settled).toMatchObject({
      status: "SETTLED",
      lastProjectedEventSequence: binding.lastProjectedEventSequence + 1,
    });
    expect(await runtime.checkpointer.listEvents(runId)).toEqual([]);
  });

  it("dispatches a linked retry from its persisted invocation", async () => {
    if (!db || !runtime) throw new Error("Test runtime was not initialized.");
    const activeRuntime = runtime;
    const user = await executeCommand({ db: db.client }, createUser, {
      email: `${randomUUID()}@example.com`,
      name: "Retry worker",
    });
    const project = await executeCommand({ db: db.client }, createProject, {
      name: "Retry project",
      description: null,
      creatorId: user.id,
    });
    const original = await createTrackedTaskAdapter({
      db: db.client,
      actorId: user.id,
      invocation: BatchAutoTranslationInvocationSchema.parse({
        projectId: project.id,
        contentNodeIds: [],
        elementIds: [],
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
    const originalRunId = await bindRunningTask(original);
    await executeCommand({ db: db.client }, projectWorkflowTaskDispatchEvent, {
      runId: originalRunId,
      eventId: randomUUID(),
      sequence: 1,
      action: "fail",
      failure: {
        code: "CAT_OPERATION_FAILED",
        message: "retry fixture",
        severity: "ERROR",
        retryable: true,
        affectedResources: original.task.state.resources,
        redactionBoundary: "INTERNAL",
      },
    });

    const observer = await db.openConcurrentClient();
    try {
      const retry = await runtime.taskService.retryAndSchedule({
        taskId: original.task.id,
        actorId: user.id,
      });
      createdTaskIds.add(retry.id);

      expect(retry.state.retryOfTaskId).toBe(original.task.id);
      expect(retry.task.payload).toEqual(original.task.task.payload);
      expect(retry.startedAt).not.toBeNull();
      expect(retry.state.status).not.toBe("PENDING");
      const retryBinding = await executeQuery(
        { db: observer.client },
        getLatestWorkflowTaskDispatch,
        { taskId: retry.id },
      );
      const metadata = await executeQuery(
        { db: observer.client },
        loadAgentRunMetadata,
        { externalId: retryBinding?.runId ?? "" },
      );
      expect(metadata?.metadata).toMatchObject({
        localizationTaskDispatchId: retryBinding?.id,
        sessionId: expect.any(Number),
      });
      await vi.waitFor(
        async () => {
          const current = await executeQuery(
            { db: observer.client },
            getLocalizationTaskForWorkflow,
            { taskId: retry.id },
          );
          expect(["COMPLETED", "FAILED", "CANCELED"]).toContain(
            current?.state.status,
          );
        },
        { timeout: 5_000 },
      );
      await vi.waitFor(
        () => {
          expect(
            activeRuntime.scheduler.hasRun(retryBinding?.runId ?? ""),
          ).toBe(false);
        },
        { timeout: 5_000 },
      );
    } finally {
      await observer.cleanup();
    }
  });

  it("reconciles a persisted failure without a run:end event", async () => {
    if (!db || !runtime) throw new Error("Test runtime was not initialized.");
    const user = await executeCommand({ db: db.client }, createUser, {
      email: `${randomUUID()}@example.com`,
      name: "Failed recovery worker",
    });
    const project = await executeCommand({ db: db.client }, createProject, {
      name: "Failed recovery project",
      description: null,
      creatorId: user.id,
    });
    const adapter = await createTrackedTaskAdapter({
      db: db.client,
      actorId: user.id,
      invocation: BatchAutoTranslationInvocationSchema.parse({
        projectId: project.id,
        contentNodeIds: [],
        elementIds: [],
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
    const definition = await executeCommand(
      { db: db.client },
      createAgentDefinition,
      {
        name: `failed-recovery-${randomUUID()}`,
        description: "Recovery test",
        scopeType: "GLOBAL",
        scopeId: "",
        definitionId: `failed-recovery-${randomUUID()}`,
        version: "1.0.0",
        type: "WORKFLOW",
        tools: [],
        content: "",
        isBuiltin: true,
      },
    );
    const session = await executeCommand(
      { db: db.client },
      createAgentSession,
      {
        agentDefinitionId: definition.id,
        userId: user.id,
        projectId: project.id,
        metadata: {},
      },
    );
    const sessionRow = await executeQuery(
      { db: db.client },
      getAgentSessionByExternalId,
      { externalId: session.sessionId },
    );
    if (!sessionRow) throw new Error("Recovery session missing.");
    const run = await executeCommand({ db: db.client }, createAgentRun, {
      sessionId: session.sessionId,
      graphDefinition: batchAutoTranslateGraph.graphDefinition,
    });
    void run;
    const boundRunId = await bindRunningTask(adapter);
    const timestamp = new Date().toISOString();
    expect(await runtime.checkpointer.claimRunOwnership(boundRunId)).toBe(true);
    await runtime.checkpointer.saveEvent(
      createAgentEvent({
        eventId: randomUUID(),
        runId: boundRunId,
        type: "run:error",
        timestamp,
        payload: {
          error: "Workflow startup publication failed.",
          operationFailure: {
            code: "CAT_OPERATION_FAILED",
            message: "Workflow startup publication failed.",
            severity: "ERROR",
            retryable: true,
            affectedResources: [],
            redactionBoundary: "INTERNAL",
          },
        },
      }),
    );
    await runtime.checkpointer.saveRunMetadata(boundRunId, {
      graphId: batchAutoTranslateGraph.id,
      status: "failed",
      startedAt: timestamp,
      completedAt: timestamp,
      graphDefinition: batchAutoTranslateGraph.graphDefinition,
      metadata: {
        sessionId: sessionRow.id,
        localizationTaskId: adapter.task.id,
      },
    });

    await runtime.taskProjector.reconcile();

    const recovered = await adapter.refresh();
    const settled = await executeQuery(
      { db: db.client },
      getLatestWorkflowTaskDispatch,
      { taskId: adapter.task.id },
    );
    expect(recovered.state.status).toBe("FAILED");
    expect(settled?.status).toBe("SETTLED");
    const failure = await executeQuery({ db: db.client }, getOperationFailure, {
      id: recovered.state.currentFailureId ?? "",
      authorization: {
        viewerId: user.id,
        authorizedProjectIds: [project.id],
        systemAdmin: false,
      },
    });
    expect(failure).toMatchObject({
      code: "CAT_OPERATION_FAILED",
      retryable: true,
    });
  });

  it("cancels an orphaned allocation before confirming an undispatched task", async () => {
    if (!db || !runtime) throw new Error("Test runtime was not initialized.");
    const user = await executeCommand({ db: db.client }, createUser, {
      email: `${randomUUID()}@example.com`,
      name: "Orphan allocation worker",
    });
    const project = await executeCommand({ db: db.client }, createProject, {
      name: "Orphan allocation project",
      description: null,
      creatorId: user.id,
    });
    const adapter = await createTrackedTaskAdapter({
      db: db.client,
      actorId: user.id,
      invocation: BatchAutoTranslationInvocationSchema.parse({
        projectId: project.id,
        contentNodeIds: [],
        elementIds: [],
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
    const definition = await executeCommand(
      { db: db.client },
      createAgentDefinition,
      {
        name: `orphan-allocation-${randomUUID()}`,
        description: "Orphan allocation recovery test",
        scopeType: "GLOBAL",
        scopeId: "",
        definitionId: `orphan-allocation-${randomUUID()}`,
        version: "1.0.0",
        type: "WORKFLOW",
        tools: [],
        content: "",
        isBuiltin: true,
      },
    );
    const session = await executeCommand(
      { db: db.client },
      createAgentSession,
      {
        agentDefinitionId: definition.id,
        userId: user.id,
        projectId: project.id,
        metadata: {},
      },
    );
    const sessionRow = await executeQuery(
      { db: db.client },
      getAgentSessionByExternalId,
      { externalId: session.sessionId },
    );
    if (!sessionRow) throw new Error("Orphan session missing.");
    const run = await executeCommand({ db: db.client }, createAgentRun, {
      sessionId: session.sessionId,
      graphDefinition: batchAutoTranslateGraph.graphDefinition,
      deduplicationKey: `orphan-binding:${adapter.task.id}`,
    });
    void run;
    const boundRunId = await bindRunningTask(adapter);
    const timestamp = new Date().toISOString();
    expect(await runtime.checkpointer.claimRunOwnership(boundRunId)).toBe(true);
    await runtime.checkpointer.saveRunMetadata(boundRunId, {
      graphId: batchAutoTranslateGraph.id,
      status: "running",
      deduplicationKey: `localization-task:${adapter.task.id}`,
      startedAt: timestamp,
      graphDefinition: batchAutoTranslateGraph.graphDefinition,
      metadata: {
        sessionId: sessionRow.id,
        localizationTaskId: adapter.task.id,
      },
    });
    await runtime.checkpointer.saveSnapshot(boundRunId, {
      runId: boundRunId,
      version: 1,
      data: {},
      createdAt: timestamp,
      updatedAt: timestamp,
    });

    const cancelled = await runtime.taskService.requestCancel({
      taskId: adapter.task.id,
      requestId: randomUUID(),
    });
    const metadata = await runtime.checkpointer.loadRunMetadata(boundRunId);
    expect(metadata?.status).toBe("cancelled");
    expect(cancelled.state.status).toBe("CANCELED");
  });

  it("records cancellation without touching a live remote owner", async () => {
    if (!db || !runtime) throw new Error("Test runtime was not initialized.");
    const user = await executeCommand({ db: db.client }, createUser, {
      email: `${randomUUID()}@example.com`,
      name: "Crash restart owner",
    });
    const project = await executeCommand({ db: db.client }, createProject, {
      name: "Crash restart project",
      description: null,
      creatorId: user.id,
    });
    const adapter = await createTrackedTaskAdapter({
      db: db.client,
      actorId: user.id,
      invocation: BatchAutoTranslationInvocationSchema.parse({
        projectId: project.id,
        contentNodeIds: [],
        elementIds: [],
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
    const runId = await bindRunningTask(adapter);
    expect(await runtime.checkpointer.loadSnapshot(runId)).toBeNull();

    const other = await db.openConcurrentClient();
    const restartPluginManager = PluginManager.get(
      "GLOBAL",
      `task-projector-restart-${randomUUID()}`,
      new TestPluginLoader(),
    );
    const restarted = createDefaultGraphRuntime(
      other.client,
      restartPluginManager,
      { startReconciliationLoops: false },
    );
    try {
      const cancelled = await restarted.taskService.requestCancel({
        taskId: adapter.task.id,
        requestId: randomUUID(),
      });
      await restarted.taskService.reconcilePending();
      const dispatch = await executeQuery(
        { db: other.client },
        getLatestWorkflowTaskDispatch,
        { taskId: adapter.task.id },
      );
      expect(cancelled.state.status).toBe("CANCEL_REQUESTED");
      expect((await adapter.refresh()).state.status).toBe("CANCEL_REQUESTED");
      expect(dispatch?.status).toBe("CANCELLING");
      expect(await restarted.checkpointer.loadSnapshot(runId)).toBeNull();
      expect(await restarted.checkpointer.listEvents(runId)).toEqual([]);
    } finally {
      await restarted.dispose();
      await other.cleanup();
    }
  });

  it("skips a live remote cancellation and still projects a local terminal cancellation", async () => {
    if (!db || !runtime) throw new Error("Test runtime was not initialized.");
    const user = await executeCommand({ db: db.client }, createUser, {
      email: `${randomUUID()}@example.com`,
      name: "Projector reconciliation owner",
    });
    const project = await executeCommand({ db: db.client }, createProject, {
      name: "Projector reconciliation project",
      description: null,
      creatorId: user.id,
    });
    const remote = await createTaskAdapter({
      actorId: user.id,
      projectId: project.id,
    });
    const local = await createTaskAdapter({
      actorId: user.id,
      projectId: project.id,
    });
    const remoteOwnerId = randomUUID();
    const remoteRuntime = createDefaultGraphRuntime(
      db.client,
      PluginManager.get(
        "GLOBAL",
        `projector-remote-owner-${randomUUID()}`,
        new TestPluginLoader(),
      ),
      { ownerId: remoteOwnerId, startReconciliationLoops: false },
    );
    try {
      const remoteRunId = await bindRunningTask(remote, 30_000, remoteRuntime);
      const localRunId = await bindRunningTask(local);
      await saveCancelledRunMetadata(remoteRuntime, remoteRunId);
      await saveCancelledRunMetadata(runtime, localRunId);
      await executeCommand(
        { db: db.client },
        requestWorkflowTaskDispatchCancel,
        { taskId: remote.task.id, requestId: randomUUID() },
      );
      await executeCommand(
        { db: db.client },
        requestWorkflowTaskDispatchCancel,
        { taskId: local.task.id, requestId: randomUUID() },
      );

      await expect(runtime.taskProjector.reconcile()).resolves.toBeUndefined();

      const remoteDispatch = await executeQuery(
        { db: db.client },
        getLatestWorkflowTaskDispatch,
        { taskId: remote.task.id },
      );
      const localDispatch = await executeQuery(
        { db: db.client },
        getLatestWorkflowTaskDispatch,
        { taskId: local.task.id },
      );
      expect((await remote.refresh()).state.status).toBe("CANCEL_REQUESTED");
      expect(remoteDispatch).toMatchObject({
        status: "CANCELLING",
        ownerId: remoteOwnerId,
      });
      expect((await local.refresh()).state.status).toBe("CANCELED");
      expect(localDispatch).toMatchObject({ status: "SETTLED" });
    } finally {
      await remoteRuntime.taskProjector.reconcile();
      await remoteRuntime.dispose();
    }
  });

  it("continues reconciliation when one binding throws", async () => {
    if (!db || !runtime) throw new Error("Test runtime was not initialized.");
    const user = await executeCommand({ db: db.client }, createUser, {
      email: `${randomUUID()}@example.com`,
      name: "Projector isolation worker",
    });
    const project = await executeCommand({ db: db.client }, createProject, {
      name: "Projector isolation project",
      description: null,
      creatorId: user.id,
    });
    const failing = await createTaskAdapter({
      actorId: user.id,
      projectId: project.id,
    });
    const succeeding = await createTaskAdapter({
      actorId: user.id,
      projectId: project.id,
    });
    const failingRunId = await bindRunningTask(failing);
    const succeedingRunId = await bindRunningTask(succeeding);
    await saveCancelledRunMetadata(runtime, succeedingRunId);
    const listEvents = runtime.checkpointer.listEvents.bind(
      runtime.checkpointer,
    );
    const listEventsSpy = vi
      .spyOn(runtime.checkpointer, "listEvents")
      .mockImplementation(async (runId, afterSequence) => {
        if (runId === failingRunId) {
          throw new Error("Injected reconciliation failure.");
        }
        return await listEvents(runId, afterSequence);
      });
    try {
      await expect(runtime.taskProjector.reconcile()).resolves.toBeUndefined();
    } finally {
      listEventsSpy.mockRestore();
    }

    expect((await succeeding.refresh()).state.status).toBe("CANCELED");
  });

  it("fences a late old-generation projection after the same task resumes", async () => {
    if (!db || !runtime) throw new Error("Test runtime was not initialized.");
    const activeRuntime = runtime;
    const user = await executeCommand({ db: db.client }, createUser, {
      email: `${randomUUID()}@example.com`,
      name: "Old run fence worker",
    });
    const project = await executeCommand({ db: db.client }, createProject, {
      name: "Old run fence project",
      description: null,
      creatorId: user.id,
    });
    const adapter = await createTrackedTaskAdapter({
      db: db.client,
      actorId: user.id,
      invocation: BatchAutoTranslationInvocationSchema.parse({
        projectId: project.id,
        contentNodeIds: [],
        elementIds: [],
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
    const oldRunId = await bindRunningTask(adapter);
    await executeCommand({ db: db.client }, projectWorkflowTaskDispatchEvent, {
      runId: oldRunId,
      eventId: randomUUID(),
      sequence: 1,
      action: "block",
      failure: {
        code: "CAT_OPERATION_DEPENDENCY_UNAVAILABLE",
        message: "Language Analysis requires remediation.",
        severity: "ERROR",
        retryable: false,
        blocker: "language_analysis_missing_selection",
        capability: "LANGUAGE_ANALYSIS",
        affectedResources: adapter.task.state.resources,
        redactionBoundary: "PUBLIC",
      },
    });
    const resumed = await runtime.taskService.resumeAndSchedule({
      taskId: adapter.task.id,
      requestId: randomUUID(),
    });
    const observer = await db.openConcurrentClient();
    try {
      const currentDispatch = await executeQuery(
        { db: observer.client },
        getLatestWorkflowTaskDispatch,
        { taskId: adapter.task.id },
      );
      expect(currentDispatch?.runId).not.toBe(oldRunId);
      await vi.waitFor(
        () => {
          expect(
            activeRuntime.scheduler.hasRun(currentDispatch?.runId ?? ""),
          ).toBe(false);
        },
        { timeout: 5_000 },
      );
    } finally {
      await observer.cleanup();
    }
    await expect(
      executeCommand({ db: db.client }, projectWorkflowTaskDispatchEvent, {
        runId: oldRunId,
        eventId: randomUUID(),
        sequence: 2,
        action: "fail",
        failure: {
          code: "CAT_OPERATION_FAILED",
          message: "old run must not overwrite the resumed generation",
          severity: "ERROR",
          retryable: true,
          affectedResources: adapter.task.state.resources,
          redactionBoundary: "INTERNAL",
        },
      }),
    ).resolves.toBeNull();

    const current = await adapter.refresh();
    expect(current.id).toBe(resumed.id);
  });

  it("resumes a remediated blocker on the same task with a new workflow run", async () => {
    if (!db || !runtime) throw new Error("Test runtime was not initialized.");
    const activeRuntime = runtime;
    const user = await executeCommand({ db: db.client }, createUser, {
      email: `${randomUUID()}@example.com`,
      name: "Blocked task worker",
    });
    const project = await executeCommand({ db: db.client }, createProject, {
      name: "Blocked task project",
      description: null,
      creatorId: user.id,
    });
    const adapter = await createTrackedTaskAdapter({
      db: db.client,
      actorId: user.id,
      invocation: BatchAutoTranslationInvocationSchema.parse({
        projectId: project.id,
        contentNodeIds: [],
        elementIds: [],
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
    await bindRunningTask(adapter);
    const binding = await executeQuery(
      { db: db.client },
      getLatestWorkflowTaskDispatch,
      { taskId: adapter.task.id },
    );
    if (!binding) throw new Error("Workflow dispatch missing.");
    await executeCommand({ db: db.client }, projectWorkflowTaskDispatchEvent, {
      runId: binding.runId,
      eventId: randomUUID(),
      sequence: 1,
      action: "block",
      failure: {
        code: "CAT_OPERATION_DEPENDENCY_UNAVAILABLE",
        message: "Language Analysis selection changed.",
        severity: "ERROR",
        retryable: true,
        blocker: "language_analysis_policy_changed",
        capability: "LANGUAGE_ANALYSIS",
        affectedResources: adapter.task.state.resources,
        redactionBoundary: "INTERNAL",
      },
    });

    const resumed = await runtime.taskService.resumeAndSchedule({
      taskId: adapter.task.id,
      requestId: randomUUID(),
    });
    const observer = await db.openConcurrentClient();
    try {
      const currentDispatch = await executeQuery(
        { db: observer.client },
        getLatestWorkflowTaskDispatch,
        { taskId: resumed.id },
      );
      expect(resumed.id).toBe(adapter.task.id);
      expect(resumed.state.retryOfTaskId).toBeNull();
      expect(resumed.state.status).not.toBe("PENDING");
      expect(["RUNNING", "COMPLETED"]).toContain(resumed.state.status);
      await vi.waitFor(
        async () => {
          const current = await executeQuery(
            { db: observer.client },
            getLocalizationTaskForWorkflow,
            { taskId: resumed.id },
          );
          expect(["COMPLETED", "FAILED", "CANCELED"]).toContain(
            current?.state.status,
          );
        },
        { timeout: 5_000 },
      );
      await vi.waitFor(
        () => {
          expect(
            activeRuntime.scheduler.hasRun(currentDispatch?.runId ?? ""),
          ).toBe(false);
        },
        { timeout: 5_000 },
      );
    } finally {
      await observer.cleanup();
    }
  });

  it("retries a self-owned RUNNING dispatch after its live AgentRun lease expires", async () => {
    if (!db || !runtime) throw new Error("Test runtime was not initialized.");
    const user = await executeCommand({ db: db.client }, createUser, {
      email: `${randomUUID()}@example.com`,
      name: "Running lease skew worker",
    });
    const project = await executeCommand({ db: db.client }, createProject, {
      name: "Running lease skew project",
      description: null,
      creatorId: user.id,
    });
    const adapter = await createTrackedTaskAdapter({
      db: db.client,
      actorId: user.id,
      invocation: BatchAutoTranslationInvocationSchema.parse({
        projectId: project.id,
        contentNodeIds: [],
        elementIds: [],
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
    const ownerA = randomUUID();
    const sourcePluginManager = PluginManager.get(
      "GLOBAL",
      `running-lease-skew-source-${randomUUID()}`,
      new TestPluginLoader(),
    );
    const source = createDefaultGraphRuntime(db.client, sourcePluginManager, {
      ownerId: ownerA,
      ownerLeaseMs: 400,
      startReconciliationLoops: false,
    });
    const runId = await bindRunningTask(adapter, 50, source);
    const before = await executeQuery(
      { db: db.client },
      getLatestWorkflowTaskDispatch,
      { taskId: adapter.task.id },
    );
    if (!before) throw new Error("Workflow dispatch missing.");
    await db.client.execute("SELECT pg_sleep(0.08)");

    const other = await db.openConcurrentClient();
    const ownerB = randomUUID();
    const ownerC = randomUUID();
    const restartPluginManager = PluginManager.get(
      "GLOBAL",
      `running-lease-skew-${randomUUID()}`,
      new TestPluginLoader(),
    );
    const restarted = createDefaultGraphRuntime(
      other.client,
      restartPluginManager,
      {
        ownerId: ownerB,
        ownerLeaseMs: 400,
        startReconciliationLoops: false,
      },
    );
    try {
      await restarted.taskService.reconcilePending();
      const deferred = await executeQuery(
        { db: other.client },
        getLatestWorkflowTaskDispatch,
        { taskId: adapter.task.id },
      );
      expect(deferred).toMatchObject({
        id: before.id,
        status: "RUNNING",
        ownerId: ownerB,
        ownerEpoch: before.ownerEpoch + 1,
        attemptCount: before.attemptCount + 1,
      });

      await other.client.execute("SELECT pg_sleep(0.35)");
      await restarted.taskService.reconcilePending();

      const recovered = await executeQuery(
        { db: other.client },
        getLatestWorkflowTaskDispatch,
        { taskId: adapter.task.id },
      );
      expect(recovered).toMatchObject({
        id: before.id,
        ownerId: ownerB,
        ownerEpoch: deferred?.ownerEpoch,
        attemptCount: deferred?.attemptCount,
      });
      expect(restarted.checkpointer.getRunOwnershipFence(runId)).toMatchObject({
        ownerId: ownerB,
      });
      await expect(
        executeCommand({ db: other.client }, claimWorkflowTaskDispatch, {
          dispatchId: before.id,
          ownerId: ownerC,
          leaseDurationMs: 30_000,
        }),
      ).resolves.toBeNull();
      await expect(
        executeCommand({ db: other.client }, renewWorkflowTaskDispatch, {
          dispatchId: before.id,
          ownerId: ownerA,
          ownerEpoch: before.ownerEpoch,
          leaseDurationMs: 30_000,
        }),
      ).resolves.toBe(false);
      await expect(source.checkpointer.renewRunOwnership(runId)).resolves.toBe(
        false,
      );
    } finally {
      await restarted.dispose();
      await source.dispose();
      await other.cleanup();
    }
  });

  it("retries a self-owned CANCELLING dispatch after its live AgentRun lease expires", async () => {
    if (!db || !runtime) throw new Error("Test runtime was not initialized.");
    const user = await executeCommand({ db: db.client }, createUser, {
      email: `${randomUUID()}@example.com`,
      name: "Cancelling lease skew worker",
    });
    const project = await executeCommand({ db: db.client }, createProject, {
      name: "Cancelling lease skew project",
      description: null,
      creatorId: user.id,
    });
    const adapter = await createTrackedTaskAdapter({
      db: db.client,
      actorId: user.id,
      invocation: BatchAutoTranslationInvocationSchema.parse({
        projectId: project.id,
        contentNodeIds: [],
        elementIds: [],
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
    const ownerA = randomUUID();
    const sourcePluginManager = PluginManager.get(
      "GLOBAL",
      `cancelling-lease-skew-source-${randomUUID()}`,
      new TestPluginLoader(),
    );
    const source = createDefaultGraphRuntime(db.client, sourcePluginManager, {
      ownerId: ownerA,
      ownerLeaseMs: 400,
      startReconciliationLoops: false,
    });
    const runId = await bindRunningTask(adapter, 50, source);
    const before = await executeQuery(
      { db: db.client },
      getLatestWorkflowTaskDispatch,
      { taskId: adapter.task.id },
    );
    if (!before) throw new Error("Workflow dispatch missing.");
    await executeCommand({ db: db.client }, requestWorkflowTaskDispatchCancel, {
      taskId: adapter.task.id,
      requestId: randomUUID(),
    });
    await db.client.execute("SELECT pg_sleep(0.08)");

    const other = await db.openConcurrentClient();
    const ownerB = randomUUID();
    const ownerC = randomUUID();
    const restartPluginManager = PluginManager.get(
      "GLOBAL",
      `cancelling-lease-skew-${randomUUID()}`,
      new TestPluginLoader(),
    );
    const restarted = createDefaultGraphRuntime(
      other.client,
      restartPluginManager,
      {
        ownerId: ownerB,
        ownerLeaseMs: 400,
        startReconciliationLoops: false,
      },
    );
    try {
      await restarted.taskService.reconcilePending();
      const deferred = await executeQuery(
        { db: other.client },
        getLatestWorkflowTaskDispatch,
        { taskId: adapter.task.id },
      );
      expect(deferred).toMatchObject({
        id: before.id,
        status: "CANCELLING",
        ownerId: ownerB,
        ownerEpoch: before.ownerEpoch + 1,
        attemptCount: before.attemptCount + 1,
      });
      await expect(
        executeCommand({ db: other.client }, claimWorkflowTaskDispatch, {
          dispatchId: before.id,
          ownerId: ownerC,
          leaseDurationMs: 30_000,
        }),
      ).resolves.toBeNull();
      await other.client.execute("SELECT pg_sleep(0.35)");
      await restarted.taskService.reconcilePending();

      await expect(
        executeCommand({ db: db.client }, renewWorkflowTaskDispatch, {
          dispatchId: before.id,
          ownerId: ownerA,
          ownerEpoch: before.ownerEpoch,
          leaseDurationMs: 30_000,
        }),
      ).resolves.toBe(false);
      await expect(source.checkpointer.renewRunOwnership(runId)).resolves.toBe(
        false,
      );
      await expect(
        source.checkpointer.saveSnapshot(runId, {
          runId,
          version: 1,
          data: {},
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }),
      ).rejects.toThrow("owner lease lost");

      await vi.waitFor(async () => {
        const current = await adapter.refresh();
        expect(current.state.status).toBe("CANCELED");
      });
      const settled = await executeQuery(
        { db: other.client },
        getLatestWorkflowTaskDispatch,
        { taskId: adapter.task.id },
      );
      expect(settled).toMatchObject({
        status: "SETTLED",
        ownerId: ownerB,
        ownerEpoch: deferred?.ownerEpoch,
        attemptCount: deferred?.attemptCount,
      });
    } finally {
      await restarted.dispose();
      await source.dispose();
      await other.cleanup();
    }
  });
});
