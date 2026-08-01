import { randomUUID } from "node:crypto";

import {
  createAgentDefinition,
  createAgentRun,
  createAgentSession,
  createProject,
  createUser,
  executeCommand,
  executeQuery,
  findAgentDefinitionByNameAndScope,
  getAgentSessionByExternalId,
  getOperationFailure,
} from "@cat/domain";
import { PluginManager } from "@cat/plugin-core";
import { BatchAutoTranslationInvocationSchema } from "@cat/shared";
import { TestPluginLoader, setupTestDB, type TestDB } from "@cat/test-utils";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { createAgentEvent } from "#/graph/events.ts";
import {
  createDefaultGraphRuntime,
  type DefaultGraphRuntime,
} from "#/graph/index.ts";

import { batchAutoTranslateGraph } from "./batch-auto-translate.ts";
import { BatchAutoTranslationTaskAdapter } from "./batch-auto-translation-task-adapter.ts";

let db: TestDB | undefined;
let runtime: DefaultGraphRuntime | undefined;

beforeAll(async () => {
  db = await setupTestDB();
  PluginManager.clear();
  const pluginManager = PluginManager.get(
    "GLOBAL",
    "task-projector-test",
    new TestPluginLoader(),
  );
  runtime = createDefaultGraphRuntime(db.client, pluginManager);
}, 30_000);

afterAll(async () => {
  await runtime?.dispose();
  PluginManager.clear();
  await db?.cleanup();
}, 30_000);

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

describe("WorkflowTaskProjector", () => {
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
    const adapter = await BatchAutoTranslationTaskAdapter.create({
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
    const runId = randomUUID();
    const claimId = randomUUID();
    await adapter.claimDispatch(claimId, 30_000);
    await adapter.bindRunAndStart(runId, claimId, "PREPARING");

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
    await runtime.checkpointer.saveSnapshot(runId, {
      runId,
      version: 1,
      data: terminalBlackboard,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    await runtime.taskProjector.projectEvent(progress);
    await runtime.checkpointer.saveEvent(terminal);
    await adapter.requestCancel();

    await runtime.taskProjector.reconcile();
    const projected = await adapter.refresh();
    expect(projected.state.status).toBe("COMPLETED");
    expect(projected.state.progressCurrent).toBe(1);
    expect(projected.state.runtime.result).toEqual({
      translationIds: [41],
      translatedElementIds: [7],
      skippedElementIds: [],
    });
    expect(projected.state.runtime.lastProjectedEventSequence).toBeGreaterThan(
      0,
    );
  });

  it("dispatches a linked retry from its persisted invocation", async () => {
    if (!db || !runtime) throw new Error("Test runtime was not initialized.");
    const user = await executeCommand({ db: db.client }, createUser, {
      email: `${randomUUID()}@example.com`,
      name: "Retry worker",
    });
    const project = await executeCommand({ db: db.client }, createProject, {
      name: "Retry project",
      description: null,
      creatorId: user.id,
    });
    const original = await BatchAutoTranslationTaskAdapter.create({
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
    await original.fail({
      code: "CAT_OPERATION_FAILED",
      message: "retry fixture",
      severity: "ERROR",
      retryable: true,
      affectedResources: original.task.state.resources,
      redactionBoundary: "INTERNAL",
    });

    const retry = await runtime.taskService.retryAndSchedule({
      taskId: original.task.id,
      actorId: user.id,
    });

    expect(retry.state.retryOfTaskId).toBe(original.task.id);
    expect(retry.task.payload).toEqual(original.task.task.payload);
    expect(retry.state.runtime.runId).not.toBeNull();
    expect(retry.startedAt).not.toBeNull();
    expect(retry.state.status).not.toBe("PENDING");
    const metadata = await runtime.checkpointer.loadRunMetadata(
      retry.state.runtime.runId ?? "",
    );
    expect(metadata?.metadata).toMatchObject({
      localizationTaskId: retry.id,
      sessionId: expect.any(Number),
    });
    const retryAdapter = await BatchAutoTranslationTaskAdapter.hydrate(
      db.client,
      retry.id,
    );
    await vi.waitFor(
      async () => {
        const current = await retryAdapter.refresh();
        expect(["COMPLETED", "FAILED", "CANCELED"]).toContain(
          current.state.status,
        );
      },
      { timeout: 5_000 },
    );
  });

  it("recovers a persisted typed failure without a run:end event", async () => {
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
    const adapter = await BatchAutoTranslationTaskAdapter.create({
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
    const claimId = randomUUID();
    await adapter.claimDispatch(claimId, 30_000);
    await adapter.bindRunAndStart(run.runId, claimId, "PREPARING");
    const timestamp = new Date().toISOString();
    await runtime.checkpointer.saveRunMetadata(run.runId, {
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
    await runtime.checkpointer.saveEvent(
      createAgentEvent({
        eventId: randomUUID(),
        runId: run.runId,
        type: "run:error",
        timestamp,
        payload: {
          error: "Language Analysis is not configured.",
          operationFailure: {
            code: "CAT_OPERATION_MISSING_CAPABILITY",
            message: "Language Analysis is not configured.",
            severity: "ERROR",
            retryable: false,
            blocker: "language_analysis_missing_selection",
            capability: "LANGUAGE_ANALYSIS",
            affectedResources: [],
            remediationHint: "Configure language analysis, then resume.",
            redactionBoundary: "PUBLIC",
          },
        },
      }),
    );

    await runtime.taskProjector.reconcile();

    const recovered = await adapter.refresh();
    expect(recovered.state.status).toBe("BLOCKED");
    const failure = await executeQuery({ db: db.client }, getOperationFailure, {
      id: recovered.state.currentFailureId ?? "",
      authorization: {
        viewerId: user.id,
        authorizedProjectIds: [project.id],
        systemAdmin: false,
      },
    });
    expect(failure).toMatchObject({
      code: "CAT_OPERATION_MISSING_CAPABILITY",
      blocker: "language_analysis_missing_selection",
      capability: "LANGUAGE_ANALYSIS",
      remediationHint: "Configure language analysis, then resume.",
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
    const adapter = await BatchAutoTranslationTaskAdapter.create({
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
      deduplicationKey: `localization-task:${adapter.task.id}`,
    });
    const claimId = randomUUID();
    await adapter.claimDispatch(claimId, 30_000);
    await adapter.requestCancel();
    const timestamp = new Date().toISOString();
    await runtime.checkpointer.saveRunMetadata(run.runId, {
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
    await runtime.checkpointer.saveSnapshot(run.runId, {
      runId: run.runId,
      version: 1,
      data: {},
      createdAt: timestamp,
      updatedAt: timestamp,
    });

    await runtime.taskService.reconcilePending();
    await vi.waitFor(
      async () => {
        const metadata = await runtime?.checkpointer.loadRunMetadata(run.runId);
        expect(metadata?.status).toBe("cancelled");
      },
      { timeout: 5_000 },
    );
    await runtime.taskProjector.reconcile();
    expect((await adapter.refresh()).state.status).toBe("CANCELED");
  });

  it("fences a late old-run projection after the same task resumes", async () => {
    if (!db) throw new Error("Test database was not initialized.");
    const user = await executeCommand({ db: db.client }, createUser, {
      email: `${randomUUID()}@example.com`,
      name: "Old run fence worker",
    });
    const project = await executeCommand({ db: db.client }, createProject, {
      name: "Old run fence project",
      description: null,
      creatorId: user.id,
    });
    const adapter = await BatchAutoTranslationTaskAdapter.create({
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
    const oldRunId = randomUUID();
    const oldClaimId = randomUUID();
    await adapter.claimDispatch(oldClaimId, 30_000);
    await adapter.bindRunAndStart(oldRunId, oldClaimId, "PREPARING");
    await adapter.block({
      code: "CAT_OPERATION_DEPENDENCY_UNAVAILABLE",
      message: "Language Analysis requires remediation.",
      severity: "ERROR",
      retryable: false,
      blocker: "language_analysis_missing_selection",
      capability: "LANGUAGE_ANALYSIS",
      affectedResources: adapter.task.state.resources,
      redactionBoundary: "PUBLIC",
    });
    await adapter.resume();
    const newRunId = randomUUID();
    const newClaimId = randomUUID();
    await adapter.claimDispatch(newClaimId, 30_000);
    await adapter.bindRunAndStart(newRunId, newClaimId, "PREPARING");

    await expect(
      adapter.fail(
        {
          code: "CAT_OPERATION_FAILED",
          message: "Late failure from the old run.",
          severity: "ERROR",
          retryable: true,
          affectedResources: adapter.task.state.resources,
          redactionBoundary: "INTERNAL",
        },
        { expectedRunId: oldRunId },
      ),
    ).rejects.toThrow("is not bound to this task");
    const current = await adapter.refresh();
    expect(current.state.status).toBe("RUNNING");
    expect(current.state.runtime.runId).toBe(newRunId);
  });

  it("resumes a remediated blocker on the same task with a new workflow run", async () => {
    if (!db || !runtime) throw new Error("Test runtime was not initialized.");
    const user = await executeCommand({ db: db.client }, createUser, {
      email: `${randomUUID()}@example.com`,
      name: "Blocked task worker",
    });
    const project = await executeCommand({ db: db.client }, createProject, {
      name: "Blocked task project",
      description: null,
      creatorId: user.id,
    });
    const adapter = await BatchAutoTranslationTaskAdapter.create({
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
    const claimId = randomUUID();
    await adapter.claimDispatch(claimId, 30_000);
    await adapter.bindRunAndStart(randomUUID(), claimId, "PREPARING");
    await adapter.block({
      code: "CAT_OPERATION_DEPENDENCY_UNAVAILABLE",
      message: "Language Analysis selection changed.",
      severity: "ERROR",
      retryable: true,
      blocker: "language_analysis_policy_changed",
      capability: "LANGUAGE_ANALYSIS",
      affectedResources: adapter.task.state.resources,
      redactionBoundary: "INTERNAL",
    });

    const [resumed] = await Promise.all([
      runtime.taskService.resumeAndSchedule({
        taskId: adapter.task.id,
        requestId: randomUUID(),
      }),
      runtime.taskService.reconcilePending(),
    ]);

    expect(resumed.id).toBe(adapter.task.id);
    expect(resumed.state.retryOfTaskId).toBeNull();
    expect(resumed.state.runtime.runId).not.toBeNull();
    expect(["RUNNING", "COMPLETED"]).toContain(resumed.state.status);
    const resumedAdapter = await BatchAutoTranslationTaskAdapter.hydrate(
      db.client,
      resumed.id,
    );
    await vi.waitFor(
      async () => {
        const current = await resumedAdapter.refresh();
        expect(["COMPLETED", "FAILED", "CANCELED"]).toContain(
          current.state.status,
        );
      },
      { timeout: 5_000 },
    );
  });
});
