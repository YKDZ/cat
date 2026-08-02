import { randomUUID } from "node:crypto";

import {
  activateWorkflowTaskDispatch,
  bindWorkflowTaskDispatchSession,
  claimAgentRunOwner,
  claimWorkflowTaskDispatch,
  createAgentDefinition,
  createAgentRun,
  createAgentSession,
  createProject,
  createUser,
  executeCommand,
  executeQuery,
  getOperationFailure,
  getLatestWorkflowTaskDispatch,
  getAgentSessionByExternalId,
  resumeWorkflowTaskWithDispatch,
} from "@cat/domain";
import {
  LanguageAnalysisRequirementError,
  mapLanguageAnalysisOperationFailure,
} from "@cat/operations";
import {
  BatchAutoTranslationInvocationSchema,
  LanguageAnalysisOperationFailureBlocker,
  LanguageAnalysisRequirementAssessmentSchema,
  type OperationFailureInput,
} from "@cat/shared";
import { setupTestDB, type TestDB } from "@cat/test-utils";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { MemoryCheckpointer } from "#/graph/checkpointer/index.ts";
import { InMemoryCompensationRegistry } from "#/graph/compensation.ts";
import { InProcessEventBus } from "#/graph/event-bus.ts";
import { QueuedExecutorPool } from "#/graph/executor-pool.ts";
import { GraphRegistry } from "#/graph/graph-registry.ts";
import { InProcessLeaseManager } from "#/graph/lease.ts";
import { NodeRegistry } from "#/graph/node-registry.ts";
import { Scheduler } from "#/graph/scheduler.ts";

import { BatchAutoTranslationTaskAdapter } from "./batch-auto-translation-task-adapter.ts";
import { WorkflowTaskProjector } from "./workflow-task-projector.ts";

let db: TestDB | undefined;
let scheduler: Scheduler | undefined;

beforeAll(async () => {
  db = await setupTestDB();
});

afterAll(async () => {
  await scheduler?.dispose();
  await db?.cleanup();
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
): Promise<string> => {
  if (!db) throw new Error("Test database was not initialized.");
  const task = await adapter.refresh();
  if (task.task.kind !== "BATCH_AUTO_TRANSLATION") {
    throw new Error("Workflow adapter created a non-workflow Task.");
  }
  const definition = await executeCommand(
    { db: db.client },
    createAgentDefinition,
    {
      name: `language-binding-${randomUUID()}`,
      description: "Language failure binding",
      scopeType: "GLOBAL",
      scopeId: "",
      definitionId: `language-binding-${randomUUID()}`,
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
  const binding = await executeQuery(
    { db: db.client },
    getLatestWorkflowTaskDispatch,
    { taskId: task.id },
  );
  if (!sessionRow || !binding)
    throw new Error("Workflow test fixture missing.");
  const claimed = await executeCommand(
    { db: db.client },
    claimWorkflowTaskDispatch,
    {
      dispatchId: binding.id,
      ownerId: randomUUID(),
      leaseDurationMs: 30_000,
    },
  );
  if (!claimed) throw new Error("Workflow dispatch was not claimed.");
  await executeCommand({ db: db.client }, createAgentRun, {
    externalId: claimed.runId,
    sessionId: session.sessionId,
    graphDefinition: {},
  });
  const runLease = await executeCommand({ db: db.client }, claimAgentRunOwner, {
    externalId: claimed.runId,
    ownerId: claimed.ownerId ?? "",
    leaseDurationMs: 30_000,
  });
  if (!runLease) throw new Error("Workflow AgentRun was not claimed.");
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
    runFence: { ownerId: claimed.ownerId ?? "", epoch: runLease.epoch },
    requestId: randomUUID(),
  });
  return claimed.runId;
};

describe("Language Analysis Operation Failure task projection", () => {
  it.each([
    [
      "MISSING_SELECTION",
      "CAT_OPERATION_MISSING_CAPABILITY",
      "CONFIGURE_SELECTION",
    ],
    ["INVALID_CONFIGURATION", "CAT_OPERATION_FAILED", "FIX_CONFIGURATION"],
  ] as const)(
    "blocks a remediable %s failure and resumes the same task",
    async (reason, code, remediation) => {
      if (!db) throw new Error("Test database was not initialized.");
      const user = await executeCommand({ db: db.client }, createUser, {
        email: `${randomUUID()}@example.com`,
        name: "Language failure worker",
      });
      const project = await executeCommand({ db: db.client }, createProject, {
        name: "Language failure projection",
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
      const runId = await bindRunningTask(adapter);

      const eventBus = new InProcessEventBus();
      const checkpointer = new MemoryCheckpointer();
      const leaseManager = new InProcessLeaseManager();
      scheduler = new Scheduler({
        eventBus,
        checkpointer,
        executorPool: new QueuedExecutorPool({ leaseManager }),
        graphRegistry: new GraphRegistry(),
        nodeRegistry: new NodeRegistry(),
        compensationRegistry: new InMemoryCompensationRegistry(),
        leaseManager,
      });
      const projector = new WorkflowTaskProjector({
        db: db.client,
        eventBus,
        checkpointer,
        scheduler,
      });
      const startedAt = new Date().toISOString();
      await checkpointer.saveRunMetadata(runId, {
        graphId: "batch-auto-translate",
        status: "failed",
        startedAt,
        completedAt: startedAt,
        metadata: { localizationTaskId: adapter.task.id },
      });
      const mappedFailure = mapLanguageAnalysisOperationFailure(
        new LanguageAnalysisRequirementError(
          LanguageAnalysisRequirementAssessmentSchema.parse({
            status: "BLOCKED",
            languageId: "zh-Hans",
            policyEpoch: 1,
            selection: null,
            blocker: {
              reason,
              retryable: false,
              languageId: "zh-Hans",
              implementation: null,
              observedAt: new Date(),
              remediation,
            },
            assessedAt: new Date(),
          }),
        ),
        [],
      );
      if (mappedFailure === undefined) {
        throw new Error("Expected a mapped Language Analysis failure.");
      }
      await checkpointer.saveEvent({
        eventId: randomUUID(),
        runId,
        type: "run:error",
        timestamp: startedAt,
        payload: {
          error: mappedFailure.message,
          operationFailure: mappedFailure,
        },
      });
      await projector.projectEvent({
        eventId: randomUUID(),
        runId,
        type: "run:end",
        timestamp: startedAt,
        payload: { status: "failed" },
      });

      const projected = await adapter.refresh();
      const failureId = projected.state.currentFailureId;
      expect(projected.state.status).toBe("BLOCKED");
      expect(failureId).not.toBeNull();
      const failure = await executeQuery(
        { db: db.client },
        getOperationFailure,
        {
          id: failureId ?? "",
          authorization: {
            viewerId: user.id,
            authorizedProjectIds: [project.id],
            systemAdmin: false,
          },
        },
      );
      expect(failure).toMatchObject({
        id: failureId,
        code,
        blocker: LanguageAnalysisOperationFailureBlocker[reason],
        capability: "LANGUAGE_ANALYSIS",
        affectedResources: adapter.task.state.resources,
      } satisfies Partial<OperationFailureInput & { id: string | null }>);
      await executeCommand({ db: db.client }, resumeWorkflowTaskWithDispatch, {
        taskId: adapter.task.id,
        requestId: randomUUID(),
      });
      const resumed = await adapter.refresh();
      expect(resumed.id).toBe(adapter.task.id);
      expect(resumed.state.status).toBe("PENDING");
      const binding = await executeQuery(
        { db: db.client },
        getLatestWorkflowTaskDispatch,
        { taskId: adapter.task.id },
      );
      expect(binding).toMatchObject({ generation: 2, status: "REQUESTED" });
    },
  );
});
