import { randomUUID } from "node:crypto";

import { eq, sql, task, workflowTaskDispatch } from "@cat/db";
import { BatchAutoTranslationInvocationSchema } from "@cat/shared";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";

import {
  claimWorkflowTaskDispatch,
  createOperationFailure,
  createUser,
  createWorkflowTaskWithDispatch,
  executeCommand,
  executeQuery,
  getLocalizationTask,
  getLocalizationTaskForWorkflow,
  getLatestWorkflowTaskDispatch,
  getOperationFailure,
  listLocalizationTasks,
  projectWorkflowTaskDispatchEvent,
  requestWorkflowTaskDispatchCancel,
  resumeWorkflowTaskWithDispatch,
  retryWorkflowTaskWithDispatch,
  type CreateLocalizationTaskCommand,
} from "#/index.ts";
import { setupTestDB, type TestDB } from "#/testing/setup-test-db.ts";

import { transitionLocalizationTask } from "./upsert-localization-task.cmd.ts";

const batchInvocation = (task: {
  task: { kind: string; payload: unknown };
}) => {
  if (task.task.kind !== "BATCH_AUTO_TRANSLATION") {
    throw new Error("Expected a batch auto-translation task fixture.");
  }
  return BatchAutoTranslationInvocationSchema.parse(
    (task.task.payload as { invocation: unknown }).invocation,
  );
};

let testDb: TestDB;
let claimableDispatchIds = new Set<string>();

beforeAll(async () => {
  testDb = await setupTestDB();
});

afterAll(async () => {
  await testDb?.cleanup();
});

beforeEach(() => {
  claimableDispatchIds = new Set();
});

afterEach(async () => {
  for (const dispatchId of claimableDispatchIds) {
    await testDb.client
      .update(workflowTaskDispatch)
      .set({ status: "SETTLED", settledAt: sql`clock_timestamp()` })
      .where(eq(workflowTaskDispatch.id, dispatchId));
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

const createCommand = async (): Promise<CreateLocalizationTaskCommand> => {
  const user = await executeCommand({ db: testDb.client }, createUser, {
    email: `${randomUUID()}@example.com`,
    name: "Task worker",
  });
  const projectId = randomUUID();
  return {
    task: {
      kind: "BATCH_AUTO_TRANSLATION",
      payload: {
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
        cancelable: true,
      },
    },
    scope: { type: "PROJECT", id: projectId },
    actor: { type: "USER", id: user.id },
    resources: [{ type: "PROJECT", id: projectId }],
  };
};

const createTask = async () => {
  const created = await executeCommand(
    { db: testDb.client },
    createWorkflowTaskWithDispatch,
    await createCommand(),
  );
  claimableDispatchIds.add(created.dispatch.id);
  return created;
};

const failure = (
  resources: Awaited<
    ReturnType<typeof createTask>
  >["task"]["state"]["resources"],
) => ({
  code: "CAT_OPERATION_FAILED" as const,
  message: "workflow fixture failed",
  severity: "ERROR" as const,
  retryable: true,
  affectedResources: resources,
  redactionBoundary: "INTERNAL" as const,
});

const makeRunning = async (created: Awaited<ReturnType<typeof createTask>>) => {
  const started = await executeCommand(
    { db: testDb.client },
    transitionLocalizationTask,
    {
      taskId: created.task.id,
      expectedRevision: created.task.state.revision,
      requestId: randomUUID(),
      transition: "start",
      phase: "PREPARING",
    },
  );
  await testDb.client
    .update(workflowTaskDispatch)
    .set({ status: "RUNNING" })
    .where(eq(workflowTaskDispatch.id, created.dispatch.id));
  return started;
};

describe("localization task lifecycle", () => {
  it("keeps product transition request replay exactly once without runtime state", async () => {
    const created = await createTask();
    const requestId = randomUUID();
    const started = await executeCommand(
      { db: testDb.client },
      transitionLocalizationTask,
      {
        taskId: created.task.id,
        expectedRevision: created.task.state.revision,
        requestId,
        transition: "start",
        phase: "PREPARING",
      },
    );
    const replayed = await executeCommand(
      { db: testDb.client },
      transitionLocalizationTask,
      {
        taskId: created.task.id,
        expectedRevision: created.task.state.revision,
        requestId,
        transition: "start",
        phase: "PREPARING",
      },
    );

    expect(replayed).toEqual(started);
    expect(replayed.state.runtime).toEqual({
      kind: "BATCH_AUTO_TRANSLATION",
      phase: "PREPARING",
      result: null,
    });
  });

  it("creates a task and generation-one owner intent atomically", async () => {
    const created = await createTask();
    const binding = await executeQuery(
      { db: testDb.client },
      getLatestWorkflowTaskDispatch,
      { taskId: created.task.id },
    );

    expect(binding).toMatchObject({
      id: created.dispatch.id,
      generation: 1,
      status: "REQUESTED",
      taskId: created.task.id,
    });
    expect(created.task.state.runtime).toEqual({
      kind: "BATCH_AUTO_TRANSLATION",
      phase: null,
      result: null,
    });
  });

  it("allows exactly one concurrent owner to claim a requested intent", async () => {
    const created = await createTask();
    const other = await testDb.openConcurrentClient();
    try {
      const [first, second] = await Promise.all([
        executeCommand({ db: testDb.client }, claimWorkflowTaskDispatch, {
          ownerId: randomUUID(),
          leaseDurationMs: 30_000,
        }),
        executeCommand({ db: other.client }, claimWorkflowTaskDispatch, {
          ownerId: randomUUID(),
          leaseDurationMs: 30_000,
        }),
      ]);
      expect(
        [first, second].filter((item) => item?.id === created.dispatch.id),
      ).toHaveLength(1);
    } finally {
      await other.cleanup();
    }
  });

  it.each(["CLAIMED", "RUNNING", "CANCELLING"] as const)(
    "uses the database clock to reclaim expired %s ownership with a new fence",
    async (status) => {
      const created = await createTask();
      const previousOwner = randomUUID();
      await testDb.client
        .update(workflowTaskDispatch)
        .set({
          status,
          ownerId: previousOwner,
          ownerEpoch: 4,
          ownerLeaseExpiresAt: sql`clock_timestamp() - interval '1 second'`,
        })
        .where(eq(workflowTaskDispatch.id, created.dispatch.id));

      const ownerId = randomUUID();
      const claimed = await executeCommand(
        { db: testDb.client },
        claimWorkflowTaskDispatch,
        { ownerId, leaseDurationMs: 30_000 },
      );

      expect(claimed).toMatchObject({
        id: created.dispatch.id,
        ownerId,
        ownerEpoch: 5,
        status,
        attemptCount: 1,
      });
    },
  );

  it("settles an unstarted cancellation with its owner intent", async () => {
    const created = await createTask();
    const cancelled = await executeCommand(
      { db: testDb.client },
      requestWorkflowTaskDispatchCancel,
      { taskId: created.task.id, requestId: randomUUID() },
    );
    const binding = await executeQuery(
      { db: testDb.client },
      getLatestWorkflowTaskDispatch,
      { taskId: created.task.id },
    );

    expect(cancelled.task.state.status).toBe("CANCELED");
    expect(binding).toMatchObject({
      status: "SETTLED",
      settledAt: expect.any(Date),
    });
  });

  it("settles terminal event and advances the private cursor in one projection", async () => {
    const created = await createTask();
    await makeRunning(created);
    const completed = await executeCommand(
      { db: testDb.client },
      projectWorkflowTaskDispatchEvent,
      {
        runId: created.dispatch.runId,
        eventId: randomUUID(),
        sequence: 1,
        action: "complete",
        result: {
          translationIds: [],
          translatedElementIds: [],
          skippedElementIds: [],
        },
      },
    );
    const binding = await executeQuery(
      { db: testDb.client },
      getLatestWorkflowTaskDispatch,
      { taskId: created.task.id },
    );

    expect(completed?.state.status).toBe("COMPLETED");
    expect(binding).toMatchObject({
      status: "SETTLED",
      lastProjectedEventSequence: 1,
    });
  });

  it("consumes stale progress while cancellation is pending but rejects settlement without a cancelled run", async () => {
    const created = await createTask();
    const running = await makeRunning(created);
    await executeCommand({ db: testDb.client }, transitionLocalizationTask, {
      taskId: created.task.id,
      expectedRevision: running.state.revision,
      requestId: randomUUID(),
      transition: "requestCancel",
    });
    await testDb.client
      .update(workflowTaskDispatch)
      .set({ status: "CANCELLING" })
      .where(eq(workflowTaskDispatch.id, created.dispatch.id));

    const projected = await executeCommand(
      { db: testDb.client },
      projectWorkflowTaskDispatchEvent,
      {
        runId: created.dispatch.runId,
        eventId: randomUUID(),
        sequence: 1,
        action: "progress",
        current: 1,
        total: 2,
        phase: "TRANSLATING",
      },
    );
    const replayed = await executeCommand(
      { db: testDb.client },
      projectWorkflowTaskDispatchEvent,
      {
        runId: created.dispatch.runId,
        eventId: randomUUID(),
        sequence: 1,
        action: "progress",
        current: 1,
        total: 2,
        phase: "TRANSLATING",
      },
    );
    const binding = await executeQuery(
      { db: testDb.client },
      getLatestWorkflowTaskDispatch,
      { taskId: created.task.id },
    );
    await expect(
      executeCommand({ db: testDb.client }, projectWorkflowTaskDispatchEvent, {
        runId: created.dispatch.runId,
        eventId: randomUUID(),
        sequence: 2,
        action: "confirmCancel",
        dispatchFence: { ownerId: randomUUID(), epoch: 1 },
        runFence: { ownerId: randomUUID(), epoch: 1 },
      }),
    ).rejects.toThrow();
    const settledBinding = await executeQuery(
      { db: testDb.client },
      getLatestWorkflowTaskDispatch,
      { taskId: created.task.id },
    );

    expect(projected?.state.status).toBe("CANCEL_REQUESTED");
    expect(replayed).toBeNull();
    expect(binding).toMatchObject({
      status: "CANCELLING",
      lastProjectedEventSequence: 1,
    });
    expect(
      (
        await executeQuery(
          { db: testDb.client },
          getLocalizationTaskForWorkflow,
          { taskId: created.task.id },
        )
      )?.state.status,
    ).toBe("CANCEL_REQUESTED");
    expect(settledBinding).toMatchObject({
      status: "CANCELLING",
      lastProjectedEventSequence: 1,
    });
  });

  it("ignores duplicate cursor and does not let an older generation overwrite a resumed task", async () => {
    const created = await createTask();
    const running = await makeRunning(created);
    const blocked = await executeCommand(
      { db: testDb.client },
      transitionLocalizationTask,
      {
        taskId: created.task.id,
        expectedRevision: running.state.revision,
        requestId: randomUUID(),
        transition: "block",
        failure: failure(created.task.state.resources),
      },
    );
    await testDb.client
      .update(workflowTaskDispatch)
      .set({ status: "SETTLED", settledAt: sql`clock_timestamp()` })
      .where(eq(workflowTaskDispatch.id, created.dispatch.id));
    const resumed = await executeCommand(
      { db: testDb.client },
      resumeWorkflowTaskWithDispatch,
      { taskId: created.task.id, requestId: randomUUID() },
    );
    claimableDispatchIds.add(resumed.dispatch.id);

    const oldResult = await executeCommand(
      { db: testDb.client },
      projectWorkflowTaskDispatchEvent,
      {
        runId: created.dispatch.runId,
        eventId: randomUUID(),
        sequence: 1,
        action: "fail",
        failure: failure(created.task.state.resources),
      },
    );
    const next = await executeQuery(
      { db: testDb.client },
      getLatestWorkflowTaskDispatch,
      { taskId: created.task.id },
    );

    expect(blocked.state.status).toBe("BLOCKED");
    expect(resumed.dispatch.generation).toBe(2);
    expect(oldResult).toBeNull();
    expect(next).toMatchObject({ generation: 2, status: "REQUESTED" });
  });

  it("creates one retry task and one generation-one intent under concurrent requests", async () => {
    const created = await createTask();
    const failed = await executeCommand(
      { db: testDb.client },
      transitionLocalizationTask,
      {
        taskId: created.task.id,
        expectedRevision: created.task.state.revision,
        requestId: randomUUID(),
        transition: "fail",
        failure: failure(created.task.state.resources),
      },
    );
    const other = await testDb.openConcurrentClient();
    try {
      const actorId = failed.state.actor.id ?? "";
      const retries = await Promise.allSettled([
        executeCommand({ db: testDb.client }, retryWorkflowTaskWithDispatch, {
          taskId: failed.id,
          actorId,
        }).then((result) => {
          claimableDispatchIds.add(result.dispatch.id);
          return result;
        }),
        executeCommand({ db: other.client }, retryWorkflowTaskWithDispatch, {
          taskId: failed.id,
          actorId,
        }).then((result) => {
          claimableDispatchIds.add(result.dispatch.id);
          return result;
        }),
      ]);
      expect(retries).toHaveLength(2);
      expect(
        retries.filter((result) => result.status === "fulfilled"),
      ).toHaveLength(2);
      expect(
        retries.filter((result) => result.status === "rejected"),
      ).toHaveLength(0);
      const [first, second] = retries;
      if (first?.status !== "fulfilled" || second?.status !== "fulfilled") {
        throw new Error("Concurrent retry fixture did not settle as expected.");
      }
      expect(first.value.task.id).toBe(second.value.task.id);
      expect(first.value.dispatch.id).toBe(second.value.dispatch.id);
      expect(first.value.task.state.retryOfTaskId).toBe(failed.id);
      expect(second.value.task.state.retryOfTaskId).toBe(failed.id);
      expect(first.value.dispatch).toMatchObject({
        taskId: first.value.task.id,
        generation: 1,
      });
      expect(second.value.dispatch).toMatchObject({
        taskId: second.value.task.id,
        generation: 1,
      });
    } finally {
      await other.cleanup();
    }
  });

  it("rejects a resumed generation until the blocker binding is settled", async () => {
    const created = await createTask();
    const running = await makeRunning(created);
    await executeCommand({ db: testDb.client }, transitionLocalizationTask, {
      taskId: created.task.id,
      expectedRevision: running.state.revision,
      requestId: randomUUID(),
      transition: "block",
      failure: failure(created.task.state.resources),
    });

    await expect(
      executeCommand({ db: testDb.client }, resumeWorkflowTaskWithDispatch, {
        taskId: created.task.id,
        requestId: randomUUID(),
      }),
    ).rejects.toThrow("has not settled");
  });

  it("preserves a workflow failure when a later cancellation races it", async () => {
    const created = await createTask();
    const failed = await executeCommand(
      { db: testDb.client },
      transitionLocalizationTask,
      {
        taskId: created.task.id,
        expectedRevision: created.task.state.revision,
        requestId: randomUUID(),
        transition: "fail",
        failure: failure(created.task.state.resources),
      },
    );
    await expect(
      executeCommand({ db: testDb.client }, requestWorkflowTaskDispatchCancel, {
        taskId: created.task.id,
        requestId: randomUUID(),
      }),
    ).rejects.toThrow("not valid from FAILED");
    expect(failed.state.status).toBe("FAILED");
  });

  it("does not deadlock concurrent cancellation and terminal projection across clients", async () => {
    const created = await createTask();
    const running = await makeRunning(created);
    const other = await testDb.openConcurrentClient();
    try {
      const settled = await Promise.race([
        Promise.allSettled([
          executeCommand(
            { db: testDb.client },
            requestWorkflowTaskDispatchCancel,
            { taskId: created.task.id, requestId: randomUUID() },
          ),
          executeCommand(
            { db: other.client },
            projectWorkflowTaskDispatchEvent,
            {
              runId: created.dispatch.runId,
              eventId: randomUUID(),
              sequence: 1,
              action: "complete",
              result: {
                translationIds: [],
                translatedElementIds: [],
                skippedElementIds: [],
              },
            },
          ),
        ]),
        new Promise<never>((_, reject) => {
          setTimeout(
            () => reject(new Error("dispatch/task lock deadlock")),
            2_000,
          );
        }),
      ]);
      expect(settled).toHaveLength(2);
      expect(running.state.status).toBe("RUNNING");
    } finally {
      await other.cleanup();
    }
  });

  it("rejects reuse of a product request ID for a different intent", async () => {
    const created = await createTask();
    const requestId = randomUUID();
    await executeCommand({ db: testDb.client }, transitionLocalizationTask, {
      taskId: created.task.id,
      expectedRevision: created.task.state.revision,
      requestId,
      transition: "start",
      phase: "PREPARING",
    });
    await expect(
      executeCommand({ db: testDb.client }, transitionLocalizationTask, {
        taskId: created.task.id,
        expectedRevision: 1,
        requestId,
        transition: "fail",
        failure: failure(created.task.state.resources),
      }),
    ).rejects.toThrow("different intent");
  });

  it("rejects affected elements outside the task project", async () => {
    const command = await createCommand();
    await expect(
      executeCommand({ db: testDb.client }, createWorkflowTaskWithDispatch, {
        ...command,
        task: {
          ...command.task,
          payload: {
            ...command.task.payload,
            invocation: {
              ...command.task.payload.invocation,
              elementIds: [999_999],
            },
          },
        },
        resources: [...command.resources, { type: "ELEMENT", id: "999999" }],
      }),
    ).rejects.toThrow("must belong to the task project");
  });

  it("applies SQL scope authorization before failure projection", async () => {
    const created = await createTask();
    const linked = await executeCommand(
      { db: testDb.client },
      createOperationFailure,
      {
        taskId: created.task.id,
        failure: {
          code: "CAT_OPERATION_MISSING_CAPABILITY",
          message: "vector service missing",
          severity: "ERROR",
          retryable: true,
          capability: "VECTOR_STORAGE",
          affectedResources: created.task.state.resources,
          remediationHint: "Install a vector service.",
          redactionBoundary: "PUBLIC",
        },
      },
    );
    const unauthorized = await executeQuery(
      { db: testDb.client },
      getOperationFailure,
      {
        id: linked.id,
        authorization: {
          viewerId: randomUUID(),
          authorizedProjectIds: [],
          systemAdmin: false,
        },
      },
    );
    const authorized = await executeQuery(
      { db: testDb.client },
      getOperationFailure,
      {
        id: linked.id,
        authorization: {
          viewerId: randomUUID(),
          authorizedProjectIds: [batchInvocation(created.task).projectId],
          systemAdmin: false,
        },
      },
    );
    expect(unauthorized).toBeNull();
    expect(authorized).toMatchObject({ capability: "VECTOR_STORAGE" });
  });

  it("does not authorize standalone failures by their UUID alone", async () => {
    const operationFailure = await executeCommand(
      { db: testDb.client },
      createOperationFailure,
      {
        failure: {
          code: "CAT_OPERATION_PERMISSION_DENIED",
          message: "write denied",
          severity: "WARNING",
          retryable: false,
          authorizationDecision: "rebac_denied",
          affectedResources: [],
          redactionBoundary: "PUBLIC",
        },
      },
    );
    await expect(
      executeQuery({ db: testDb.client }, getOperationFailure, {
        id: operationFailure.id,
        authorization: {
          viewerId: randomUUID(),
          authorizedProjectIds: [],
          systemAdmin: false,
        },
      }),
    ).resolves.toBeNull();
  });

  it("authorizes a standalone failure through its affected project", async () => {
    const created = await createTask();
    const projectId = batchInvocation(created.task).projectId;
    const operationFailure = await executeCommand(
      { db: testDb.client },
      createOperationFailure,
      {
        failure: {
          code: "CAT_OPERATION_REVIEW_CHANGE_BLOCKED",
          message: "review write unavailable",
          severity: "ERROR",
          retryable: false,
          blocker: "branch_write_context_unavailable",
          affectedResources: [{ type: "PROJECT", id: projectId }],
          redactionBoundary: "PUBLIC",
        },
      },
    );
    await expect(
      executeQuery({ db: testDb.client }, getOperationFailure, {
        id: operationFailure.id,
        authorization: {
          viewerId: randomUUID(),
          authorizedProjectIds: [projectId],
          systemAdmin: false,
        },
      }),
    ).resolves.toMatchObject({ id: operationFailure.id, redacted: false });
  });

  it("does not expose a public standalone failure with an unauthorized project resource", async () => {
    const created = await createTask();
    const authorizedProjectId = batchInvocation(created.task).projectId;
    const operationFailure = await executeCommand(
      { db: testDb.client },
      createOperationFailure,
      {
        failure: {
          code: "CAT_OPERATION_REVIEW_CHANGE_BLOCKED",
          message: "project-specific review details",
          severity: "ERROR",
          retryable: false,
          blocker: "branch_write_context_unavailable",
          affectedResources: [
            { type: "PROJECT", id: authorizedProjectId },
            { type: "PROJECT", id: randomUUID() },
          ],
          redactionBoundary: "PUBLIC",
        },
      },
    );

    await expect(
      executeQuery({ db: testDb.client }, getOperationFailure, {
        id: operationFailure.id,
        authorization: {
          viewerId: randomUUID(),
          authorizedProjectIds: [authorizedProjectId],
          systemAdmin: false,
        },
      }),
    ).resolves.toBeNull();
  });

  it("applies a required project predicate before a system-admin cross-project detail read", async () => {
    const created = await createTask();
    await expect(
      executeQuery({ db: testDb.client }, getLocalizationTask, {
        taskId: created.task.id,
        requiredProjectId: randomUUID(),
        authorization: {
          viewerId: randomUUID(),
          authorizedProjectIds: [],
          systemAdmin: true,
        },
      }),
    ).resolves.toBeNull();
  });

  it("does not let a system-admin project detail predicate read a non-project task", async () => {
    const command = await createCommand();
    const actorId = command.actor.id;
    if (!actorId) throw new Error("Task fixture actor is missing.");
    const [userScoped] = await testDb.client
      .insert(task)
      .values({
        kind: command.task.kind,
        payload: command.task.payload,
        scopeType: "USER",
        scopeId: actorId,
        actorType: command.actor.type,
        actorId,
        resources: command.resources,
        runtime: {
          kind: command.task.kind,
          phase: null,
          result: null,
        },
      })
      .returning({ id: task.id });
    if (!userScoped)
      throw new Error("Task fixture creation did not return a row.");
    await expect(
      executeQuery({ db: testDb.client }, getLocalizationTask, {
        taskId: userScoped.id,
        requiredProjectId: batchInvocation({ task: command.task }).projectId,
        authorization: {
          viewerId: randomUUID(),
          authorizedProjectIds: [],
          systemAdmin: true,
        },
      }),
    ).resolves.toBeNull();
  });

  it("paginates task projections with a stable keyset cursor", async () => {
    const first = await createTask();
    await createTask();
    await createTask();
    const authorization = {
      viewerId: first.task.state.actor.id ?? randomUUID(),
      authorizedProjectIds: [batchInvocation(first.task).projectId],
      systemAdmin: false,
    };
    const page = await executeQuery(
      { db: testDb.client },
      listLocalizationTasks,
      {
        authorization,
        projectId: batchInvocation(first.task).projectId,
        pageSize: 2,
      },
    );
    expect(page.items).toHaveLength(1);
    expect(page.total).toBe(1);
  });
});
