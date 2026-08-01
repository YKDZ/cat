import { randomUUID } from "node:crypto";

import { sql } from "@cat/db";
import { BatchAutoTranslationInvocationSchema } from "@cat/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  createOperationFailure,
  createUser,
  executeCommand,
  executeQuery,
  getOperationFailure,
  listLocalizationTasks,
  retryLocalizationTask,
} from "#/index.ts";
import { setupTestDB, type TestDB } from "#/testing/setup-test-db.ts";

import {
  createLocalizationTask,
  transitionLocalizationTask,
} from "./upsert-localization-task.cmd.ts";

let testDb: TestDB;

beforeAll(async () => {
  testDb = await setupTestDB();
});

afterAll(async () => {
  await testDb?.cleanup();
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

const createTask = async () => {
  const user = await executeCommand({ db: testDb.client }, createUser, {
    email: `${randomUUID()}@example.com`,
    name: "Task worker",
  });
  const projectId = randomUUID();
  const task = await executeCommand(
    { db: testDb.client },
    createLocalizationTask,
    {
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
    },
  );
  return task;
};

describe("localization task lifecycle", () => {
  it("replays a transition request idempotently after a lost response", async () => {
    const task = await createTask();
    const claimed = await executeCommand(
      { db: testDb.client },
      transitionLocalizationTask,
      {
        taskId: task.id,
        expectedRevision: task.state.revision,
        requestId: randomUUID(),
        transition: "claimDispatch",
        claimId: randomUUID(),
        leaseDurationMs: 30_000,
      },
    );
    const requestId = randomUUID();
    const started = await executeCommand(
      { db: testDb.client },
      transitionLocalizationTask,
      {
        taskId: task.id,
        expectedRevision: claimed.state.revision,
        requestId,
        transition: "bindRunAndStart",
        runId: randomUUID(),
        claimId: claimed.state.runtime.dispatchClaimId ?? "",
        phase: "PREPARING",
      },
    );
    const replayed = await executeCommand(
      { db: testDb.client },
      transitionLocalizationTask,
      {
        taskId: task.id,
        expectedRevision: claimed.state.revision,
        requestId,
        transition: "bindRunAndStart",
        runId: started.state.runtime.runId ?? "",
        claimId: claimed.state.runtime.dispatchClaimId ?? "",
        phase: "PREPARING",
      },
    );

    expect(replayed).toEqual(started);
    expect(replayed.state.revision).toBe(2);

    const progressed = await executeCommand(
      { db: testDb.client },
      transitionLocalizationTask,
      {
        taskId: task.id,
        expectedRevision: replayed.state.revision,
        requestId: randomUUID(),
        transition: "progress",
        progressCurrent: 1,
        progressTotal: 2,
        phase: "TRANSLATING",
      },
    );
    const lateReplay = await executeCommand(
      { db: testDb.client },
      transitionLocalizationTask,
      {
        taskId: task.id,
        expectedRevision: claimed.state.revision,
        requestId,
        transition: "bindRunAndStart",
        runId: started.state.runtime.runId ?? "",
        claimId: claimed.state.runtime.dispatchClaimId ?? "",
        phase: "PREPARING",
      },
    );
    expect(lateReplay.state.revision).toBe(progressed.state.revision);
  });

  it("binds and starts in one transition before workflow execution", async () => {
    const task = await createTask();
    const claimed = await executeCommand(
      { db: testDb.client },
      transitionLocalizationTask,
      {
        taskId: task.id,
        expectedRevision: 0,
        requestId: randomUUID(),
        transition: "claimDispatch",
        claimId: randomUUID(),
        leaseDurationMs: 30_000,
      },
    );

    await expect(
      executeCommand({ db: testDb.client }, transitionLocalizationTask, {
        taskId: task.id,
        expectedRevision: claimed.state.revision,
        requestId: randomUUID(),
        transition: "claimDispatch",
        claimId: randomUUID(),
        leaseDurationMs: 30_000,
      }),
    ).rejects.toThrow("active dispatch claim");

    const started = await executeCommand(
      { db: testDb.client },
      transitionLocalizationTask,
      {
        taskId: task.id,
        expectedRevision: claimed.state.revision,
        requestId: randomUUID(),
        transition: "bindRunAndStart",
        runId: randomUUID(),
        claimId: claimed.state.runtime.dispatchClaimId ?? "",
        phase: "PREPARING",
      },
    );
    expect(started.state.status).toBe("RUNNING");
    expect(started.startedAt).not.toBeNull();
    expect(started.state.runtime.dispatchClaimId).toBeNull();
  });

  it("fences a run binding to the dispatch claim that created it", async () => {
    const task = await createTask();
    const claimed = await executeCommand(
      { db: testDb.client },
      transitionLocalizationTask,
      {
        taskId: task.id,
        expectedRevision: task.state.revision,
        requestId: randomUUID(),
        transition: "claimDispatch",
        claimId: randomUUID(),
        leaseDurationMs: 30_000,
      },
    );

    await expect(
      executeCommand({ db: testDb.client }, transitionLocalizationTask, {
        taskId: task.id,
        expectedRevision: claimed.state.revision,
        requestId: randomUUID(),
        transition: "bindRun",
        runId: randomUUID(),
        claimId: randomUUID(),
      }),
    ).rejects.toThrow("active dispatch claim");
  });

  it("uses the database clock to fence an expired owner from binding after a replacement claim", async () => {
    const task = await createTask();
    const firstClaimId = randomUUID();
    const firstClaim = await executeCommand(
      { db: testDb.client },
      transitionLocalizationTask,
      {
        taskId: task.id,
        expectedRevision: task.state.revision,
        requestId: randomUUID(),
        transition: "claimDispatch",
        claimId: firstClaimId,
        leaseDurationMs: 1,
      },
    );
    await testDb.client.execute(sql`SELECT pg_sleep(0.02)`);
    const winnerClaimId = randomUUID();
    const winnerClaim = await executeCommand(
      { db: testDb.client },
      transitionLocalizationTask,
      {
        taskId: task.id,
        expectedRevision: firstClaim.state.revision,
        requestId: randomUUID(),
        transition: "claimDispatch",
        claimId: winnerClaimId,
        leaseDurationMs: 30_000,
      },
    );

    await expect(
      executeCommand({ db: testDb.client }, transitionLocalizationTask, {
        taskId: task.id,
        expectedRevision: winnerClaim.state.revision,
        requestId: randomUUID(),
        transition: "bindRunAndStart",
        runId: randomUUID(),
        claimId: firstClaimId,
        phase: "PREPARING",
      }),
    ).rejects.toThrow("active dispatch claim");

    const winner = await executeCommand(
      { db: testDb.client },
      transitionLocalizationTask,
      {
        taskId: task.id,
        expectedRevision: winnerClaim.state.revision,
        requestId: randomUUID(),
        transition: "bindRunAndStart",
        runId: randomUUID(),
        claimId: winnerClaimId,
        phase: "PREPARING",
      },
    );
    expect(winner.state.status).toBe("RUNNING");
    expect(winner.state.runtime.dispatchClaimId).toBeNull();
  });

  it("confirms an undispatched cancellation only after the database claim lease expires", async () => {
    const task = await createTask();
    const claimed = await executeCommand(
      { db: testDb.client },
      transitionLocalizationTask,
      {
        taskId: task.id,
        expectedRevision: task.state.revision,
        requestId: randomUUID(),
        transition: "claimDispatch",
        claimId: randomUUID(),
        leaseDurationMs: 1,
      },
    );
    const cancelRequested = await executeCommand(
      { db: testDb.client },
      transitionLocalizationTask,
      {
        taskId: task.id,
        expectedRevision: claimed.state.revision,
        requestId: randomUUID(),
        transition: "requestCancel",
      },
    );
    await testDb.client.execute(sql`SELECT pg_sleep(0.02)`);
    const canceled = await executeCommand(
      { db: testDb.client },
      transitionLocalizationTask,
      {
        taskId: task.id,
        expectedRevision: cancelRequested.state.revision,
        requestId: randomUUID(),
        transition: "confirmCancel",
        owner: "WORKFLOW_ADAPTER",
      },
    );
    expect(canceled.state.status).toBe("CANCELED");
  });

  it("preserves a workflow failure over a concurrent cancellation request", async () => {
    const task = await createTask();
    const claimed = await executeCommand(
      { db: testDb.client },
      transitionLocalizationTask,
      {
        taskId: task.id,
        expectedRevision: task.state.revision,
        requestId: randomUUID(),
        transition: "claimDispatch",
        claimId: randomUUID(),
        leaseDurationMs: 30_000,
      },
    );
    const started = await executeCommand(
      { db: testDb.client },
      transitionLocalizationTask,
      {
        taskId: task.id,
        expectedRevision: claimed.state.revision,
        requestId: randomUUID(),
        transition: "bindRunAndStart",
        runId: randomUUID(),
        claimId: claimed.state.runtime.dispatchClaimId ?? "",
        phase: "PREPARING",
      },
    );
    const cancellation = await executeCommand(
      { db: testDb.client },
      transitionLocalizationTask,
      {
        taskId: task.id,
        expectedRevision: started.state.revision,
        requestId: randomUUID(),
        transition: "requestCancel",
      },
    );
    const failed = await executeCommand(
      { db: testDb.client },
      transitionLocalizationTask,
      {
        taskId: task.id,
        expectedRevision: cancellation.state.revision,
        requestId: randomUUID(),
        transition: "fail",
        failure: {
          code: "CAT_OPERATION_FAILED",
          message: "Workflow failed before cancellation completed.",
          severity: "ERROR",
          retryable: true,
          affectedResources: task.state.resources,
          redactionBoundary: "INTERNAL",
        },
      },
    );
    expect(failed.state.status).toBe("FAILED");
  });

  it("rejects a reused request ID with a different transition intent", async () => {
    const task = await createTask();
    const claimed = await executeCommand(
      { db: testDb.client },
      transitionLocalizationTask,
      {
        taskId: task.id,
        expectedRevision: task.state.revision,
        requestId: randomUUID(),
        transition: "claimDispatch",
        claimId: randomUUID(),
        leaseDurationMs: 30_000,
      },
    );
    const requestId = randomUUID();
    await executeCommand({ db: testDb.client }, transitionLocalizationTask, {
      taskId: task.id,
      expectedRevision: claimed.state.revision,
      requestId,
      transition: "bindRunAndStart",
      runId: randomUUID(),
      claimId: claimed.state.runtime.dispatchClaimId ?? "",
      phase: "PREPARING",
    });

    await expect(
      executeCommand({ db: testDb.client }, transitionLocalizationTask, {
        taskId: task.id,
        expectedRevision: 2,
        requestId,
        transition: "fail",
        failure: {
          code: "CAT_OPERATION_FAILED",
          message: "must not overwrite the start",
          severity: "ERROR",
          retryable: true,
          affectedResources: task.state.resources,
          redactionBoundary: "INTERNAL",
        },
      }),
    ).rejects.toThrow("different intent");
  });

  it("returns one linked retry under concurrent requests", async () => {
    const task = await createTask();
    const failed = await executeCommand(
      { db: testDb.client },
      transitionLocalizationTask,
      {
        taskId: task.id,
        expectedRevision: 0,
        requestId: randomUUID(),
        transition: "fail",
        failure: {
          code: "CAT_OPERATION_FAILED",
          message: "retry fixture",
          severity: "ERROR",
          retryable: true,
          affectedResources: task.state.resources,
          redactionBoundary: "INTERNAL",
        },
      },
    );
    const concurrent = await testDb.openConcurrentClient();
    try {
      const actor = failed.state.actor;
      const [first, second] = await Promise.all([
        executeCommand({ db: testDb.client }, retryLocalizationTask, {
          taskId: failed.id,
          actor,
        }),
        executeCommand({ db: concurrent.client }, retryLocalizationTask, {
          taskId: failed.id,
          actor,
        }),
      ]);
      expect(second.id).toBe(first.id);
      expect(first.state.retryOfTaskId).toBe(failed.id);
      expect(first.task.payload).toEqual(failed.task.payload);
    } finally {
      await concurrent.cleanup();
    }
  });

  it("rejects affected elements outside the invocation project", async () => {
    const base = await createTask();
    await expect(
      executeCommand({ db: testDb.client }, createLocalizationTask, {
        task: {
          ...base.task,
          payload: {
            ...base.task.payload,
            invocation: {
              ...base.task.payload.invocation,
              elementIds: [999_999],
            },
          },
        },
        scope: base.state.scope,
        actor: base.state.actor,
        resources: [...base.state.resources, { type: "ELEMENT", id: "999999" }],
      }),
    ).rejects.toThrow("must belong to the task project");
  });

  it("applies SQL scope authorization before failure projection", async () => {
    const task = await createTask();
    const linked = await executeCommand(
      { db: testDb.client },
      createOperationFailure,
      {
        taskId: task.id,
        failure: {
          code: "CAT_OPERATION_MISSING_CAPABILITY",
          message: "vector service missing",
          severity: "ERROR",
          retryable: true,
          capability: "VECTOR_STORAGE",
          affectedResources: task.state.resources,
          remediationHint: "Install a vector service.",
          redactionBoundary: "PUBLIC",
        },
      },
    );
    const viewerId = randomUUID();
    const unauthorized = await executeQuery(
      { db: testDb.client },
      getOperationFailure,
      {
        id: linked.id,
        authorization: {
          viewerId,
          authorizedProjectIds: [],
          systemAdmin: false,
        },
      },
    );
    expect(unauthorized).toBeNull();

    const authorized = await executeQuery(
      { db: testDb.client },
      getOperationFailure,
      {
        id: linked.id,
        authorization: {
          viewerId,
          authorizedProjectIds: [task.task.payload.invocation.projectId],
          systemAdmin: false,
        },
      },
    );
    expect(authorized).toMatchObject({ capability: "VECTOR_STORAGE" });
  });

  it("does not authorize a direct failure by its public UUID boundary", async () => {
    const publicFailure = await executeCommand(
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
    const internalFailure = await executeCommand(
      { db: testDb.client },
      createOperationFailure,
      {
        failure: {
          code: "CAT_OPERATION_FAILED",
          message: "internal trace",
          severity: "ERROR",
          retryable: true,
          affectedResources: [],
          redactionBoundary: "INTERNAL",
        },
      },
    );
    const authorization = {
      viewerId: randomUUID(),
      authorizedProjectIds: [],
      systemAdmin: false,
    };
    expect(
      await executeQuery({ db: testDb.client }, getOperationFailure, {
        id: publicFailure.id,
        authorization,
      }),
    ).toBeNull();
    expect(
      await executeQuery({ db: testDb.client }, getOperationFailure, {
        id: internalFailure.id,
        authorization,
      }),
    ).toBeNull();
    expect(
      await executeQuery({ db: testDb.client }, getOperationFailure, {
        id: internalFailure.id,
        authorization: { ...authorization, systemAdmin: true },
      }),
    ).toMatchObject({ message: "internal trace" });
  });

  it("authorizes a standalone failure through its affected project", async () => {
    const task = await createTask();
    const projectId = task.task.payload.invocation.projectId;
    const failure = await executeCommand(
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
        id: failure.id,
        authorization: {
          viewerId: randomUUID(),
          authorizedProjectIds: [projectId],
          systemAdmin: false,
        },
      }),
    ).resolves.toMatchObject({ id: failure.id, redacted: false });
    await expect(
      executeQuery({ db: testDb.client }, getOperationFailure, {
        id: failure.id,
        authorization: {
          viewerId: randomUUID(),
          authorizedProjectIds: [],
          systemAdmin: false,
        },
      }),
    ).resolves.toBeNull();
  });

  it("paginates tasks with a stable keyset cursor", async () => {
    const first = await createTask();
    for (let index = 0; index < 2; index += 1) {
      // oxlint-disable-next-line no-await-in-loop
      await executeCommand({ db: testDb.client }, createLocalizationTask, {
        task: first.task,
        scope: first.state.scope,
        actor: first.state.actor,
        resources: first.state.resources,
      });
    }
    const authorization = {
      viewerId: first.state.actor.id ?? randomUUID(),
      authorizedProjectIds: [first.task.payload.invocation.projectId],
      systemAdmin: false,
    };
    const pageOne = await executeQuery(
      { db: testDb.client },
      listLocalizationTasks,
      {
        authorization,
        projectId: first.task.payload.invocation.projectId,
        pageSize: 2,
      },
    );
    expect(pageOne.items).toHaveLength(2);
    expect(pageOne.nextCursor).not.toBeNull();
    const pageTwo = await executeQuery(
      { db: testDb.client },
      listLocalizationTasks,
      {
        authorization,
        projectId: first.task.payload.invocation.projectId,
        pageSize: 2,
        cursor: pageOne.nextCursor ?? undefined,
      },
    );
    expect(pageTwo.items).toHaveLength(1);
    expect(pageOne.items.map((item) => item.id)).not.toContain(
      pageTwo.items[0]?.id,
    );
  });
});
