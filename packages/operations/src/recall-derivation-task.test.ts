import {
  requestRecallDerivationTaskCancel,
  projectRecallDerivationTasks,
  reconcileRecallDerivationDependency,
  createUser,
  ensureLanguages,
  executeCommand,
  executeQuery,
  listRecallDerivationTasksNeedingProjection,
} from "@cat/domain";
import {
  CanonicalInputVersionSchema,
  RecallDerivationReferenceSchema,
  RecallDerivationVersionSchema,
} from "@cat/shared";
import {
  eq,
  operationFailure,
  recallDerivationState,
  recallDerivationTaskDemand,
  setupTestDB,
  sql,
  taskTransitionRequest,
  type TestDB,
} from "@cat/test-utils";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  refreshRecallDerivationTask,
  startRecallDerivationTask,
} from "./recall-derivation-task.ts";

describe("Recall derivation Task projection", () => {
  let db: TestDB;
  let actorId: string;
  const projectId = "11111111-1111-4111-8111-111111111111";
  const canonical = CanonicalInputVersionSchema.parse(
    `sha256:${"a".repeat(64)}`,
  );
  const derivation = RecallDerivationVersionSchema.parse(
    `sha256:${"b".repeat(64)}`,
  );

  beforeEach(async () => {
    db = await setupTestDB();
    await executeCommand({ db: db.client }, ensureLanguages, {
      languageIds: ["en"],
    });
    const actor = await executeCommand({ db: db.client }, createUser, {
      email: `${crypto.randomUUID()}@example.com`,
      name: "Recall task operator",
    });
    actorId = actor.id;
  });

  afterEach(async () => {
    await db.cleanup();
  });

  const references = () => [
    RecallDerivationReferenceSchema.parse({
      targetKind: "MEMORY_ITEM",
      targetId: "101",
      languageId: "en",
      demandRevision: 1,
    }),
    RecallDerivationReferenceSchema.parse({
      targetKind: "TERM_CONCEPT",
      targetId: "202",
      languageId: "en",
      demandRevision: 1,
    }),
  ];

  const seedDemands = async () => {
    await db.client.insert(recallDerivationState).values(
      references().map((reference) => ({
        targetKind: reference.targetKind,
        targetId: reference.targetId,
        languageId: reference.languageId,
        canonicalInputVersion: canonical,
      })),
    );
  };

  it("projects coalesced demands once, preserves a blocker failure, and settles superseded work", async () => {
    await seedDemands();
    const first = await startRecallDerivationTask(db.client, {
      projectId,
      actorId,
      references: references(),
      resources: [{ type: "MEMORY", id: "memory-1" }],
    });
    const second = await startRecallDerivationTask(db.client, {
      projectId,
      actorId,
      references: references(),
    });
    expect(first.state.progressTotal).toBe(2);
    expect(second.state.progressTotal).toBe(2);

    await db.client
      .update(recallDerivationState)
      .set({
        status: "FRESH",
        requiredDerivationVersion: derivation,
        currentCanonicalInputVersion: canonical,
        currentDerivationVersion: derivation,
        taskProjectionRevision: 2,
      })
      .where(eq(recallDerivationState.targetId, "101"));
    await db.client
      .update(recallDerivationState)
      .set({
        status: "BLOCKED",
        blocker: {
          reason: "LANGUAGE_ANALYSIS",
          retryable: true,
          message: "Language analyzer is unavailable.",
        },
        taskProjectionRevision: 2,
      })
      .where(eq(recallDerivationState.targetId, "202"));

    const blocked = await refreshRecallDerivationTask(db.client, first.id);
    expect(blocked?.state).toMatchObject({
      status: "BLOCKED",
      progressCurrent: 1,
      progressTotal: 2,
    });
    const failureId = blocked?.state.currentFailureId;
    expect(failureId).not.toBeNull();
    const repeated = await refreshRecallDerivationTask(db.client, first.id);
    expect(repeated?.state.currentFailureId).toBe(failureId);
    expect(repeated?.state.revision).toBe(blocked?.state.revision);

    await db.client
      .update(recallDerivationState)
      .set({
        blocker: {
          reason: "LANGUAGE_ANALYSIS",
          retryable: false,
          message: "Language analyzer configuration is invalid.",
        },
        taskProjectionRevision: 3,
      })
      .where(eq(recallDerivationState.targetId, "202"));
    const changedBlocker = await refreshRecallDerivationTask(
      db.client,
      first.id,
    );
    expect(changedBlocker?.state.currentFailureId).not.toBe(failureId);

    await db.client
      .update(recallDerivationState)
      .set({
        status: "PENDING",
        blocker: null,
        demandRevision: 2,
        taskProjectionRevision: 4,
      })
      .where(eq(recallDerivationState.targetId, "202"));
    const settled = await refreshRecallDerivationTask(db.client, first.id);
    expect(settled?.state).toMatchObject({
      status: "COMPLETED",
      progressCurrent: 2,
      progressTotal: 2,
    });
    expect(settled?.state.runtime).toMatchObject({
      kind: "RECALL_DERIVATION",
      result: { fresh: 1, superseded: 1, total: 2 },
    });
    const result =
      settled?.state.runtime.kind === "RECALL_DERIVATION"
        ? settled.state.runtime.result
        : null;
    expect((result?.fresh ?? 0) + (result?.superseded ?? 0)).toBe(
      settled?.state.progressCurrent,
    );
  });

  it("detaches a canceled Task without changing the shared derivation demand", async () => {
    await seedDemands();
    const task = await startRecallDerivationTask(db.client, {
      projectId,
      actorId,
      references: references(),
    });
    const canceled = await executeCommand(
      { db: db.client },
      requestRecallDerivationTaskCancel,
      {
        taskId: task.id,
        expectedRevision: task.state.revision,
        requestId: crypto.randomUUID(),
      },
    );
    expect(canceled.state.status).toBe("CANCELED");
    await db.client
      .update(recallDerivationState)
      .set({
        status: "FRESH",
        requiredDerivationVersion: derivation,
        currentCanonicalInputVersion: canonical,
        currentDerivationVersion: derivation,
        taskProjectionRevision: 2,
      })
      .where(eq(recallDerivationState.targetId, "101"));
    const refreshed = await refreshRecallDerivationTask(db.client, task.id);
    expect(refreshed?.state.status).toBe("CANCELED");
  });

  it("replays a completed cancel request without confirming it again", async () => {
    await seedDemands();
    const task = await startRecallDerivationTask(db.client, {
      projectId,
      actorId,
      references: references(),
    });
    const requestId = crypto.randomUUID();
    const first = await executeCommand(
      { db: db.client },
      requestRecallDerivationTaskCancel,
      { taskId: task.id, expectedRevision: task.state.revision, requestId },
    );
    const replayed = await executeCommand(
      { db: db.client },
      requestRecallDerivationTaskCancel,
      { taskId: task.id, expectedRevision: task.state.revision, requestId },
    );

    expect(first.state.status).toBe("CANCELED");
    expect(replayed.state).toEqual(first.state);
    const requests = await db.client
      .select({ requestId: taskTransitionRequest.requestId })
      .from(taskTransitionRequest)
      .where(eq(taskTransitionRequest.taskId, task.id));
    expect(requests).toHaveLength(2);
  });

  it("settles and reconciles snapshot demands after all referenced states are deleted", async () => {
    await seedDemands();
    const task = await startRecallDerivationTask(db.client, {
      projectId,
      actorId,
      references: references(),
    });
    await db.client
      .delete(recallDerivationState)
      .where(eq(recallDerivationState.targetKind, "MEMORY_ITEM"));
    await db.client
      .delete(recallDerivationState)
      .where(eq(recallDerivationState.targetKind, "TERM_CONCEPT"));

    const demands = await db.client
      .select()
      .from(recallDerivationTaskDemand)
      .where(eq(recallDerivationTaskDemand.taskId, task.id));
    expect(demands).toHaveLength(2);
    expect(demands.every((demand) => demand.derivationStateId === null)).toBe(
      true,
    );
    expect(
      await executeQuery(
        { db: db.client },
        listRecallDerivationTasksNeedingProjection,
        { limit: 1 },
      ),
    ).toEqual([task.id]);

    const settled = await refreshRecallDerivationTask(db.client, task.id);
    expect(settled?.state).toMatchObject({
      status: "COMPLETED",
      progressCurrent: 2,
      progressTotal: 2,
    });
    expect(
      await executeQuery(
        { db: db.client },
        listRecallDerivationTasksNeedingProjection,
        { limit: 1 },
      ),
    ).toEqual([]);
  });

  it("observes a partially deleted snapshot once without starving another stale Task", async () => {
    await seedDemands();
    const taskA = await startRecallDerivationTask(db.client, {
      projectId,
      actorId,
      references: references(),
    });
    const taskBReference = RecallDerivationReferenceSchema.parse({
      targetKind: "MEMORY_ITEM",
      targetId: "303",
      languageId: "en",
      demandRevision: 1,
    });
    await db.client.insert(recallDerivationState).values({
      targetKind: taskBReference.targetKind,
      targetId: taskBReference.targetId,
      languageId: taskBReference.languageId,
      canonicalInputVersion: canonical,
    });
    const taskB = await startRecallDerivationTask(db.client, {
      projectId,
      actorId,
      references: [taskBReference],
    });
    await db.client
      .delete(recallDerivationState)
      .where(eq(recallDerivationState.targetId, "101"));

    const projected = await refreshRecallDerivationTask(db.client, taskA.id);
    expect(projected?.state).toMatchObject({
      status: "PENDING",
      progressCurrent: 1,
      progressTotal: 2,
    });
    const links = await db.client
      .select()
      .from(recallDerivationTaskDemand)
      .where(eq(recallDerivationTaskDemand.taskId, taskA.id));
    expect(
      links.some(
        (link) => link.derivationStateId === null && link.supersededAt !== null,
      ),
    ).toBe(true);
    expect(
      await executeQuery(
        { db: db.client },
        listRecallDerivationTasksNeedingProjection,
        { limit: 1 },
      ),
    ).toEqual([]);

    await db.client
      .update(recallDerivationState)
      .set({ demandRevision: 2, taskProjectionRevision: 2 })
      .where(eq(recallDerivationState.targetId, "303"));
    expect(
      await executeQuery(
        { db: db.client },
        listRecallDerivationTasksNeedingProjection,
        { limit: 1 },
      ),
    ).toEqual([taskB.id]);
  });

  it("uses the first failed state as the deterministic Task failure", async () => {
    await seedDemands();
    const task = await startRecallDerivationTask(db.client, {
      projectId,
      actorId,
      references: references(),
    });
    await db.client
      .update(recallDerivationState)
      .set({
        status: "FAILED",
        blocker: {
          reason: "LANGUAGE_ANALYSIS",
          retryable: false,
          message: "First failure is retained.",
        },
        taskProjectionRevision: 2,
      })
      .where(eq(recallDerivationState.targetId, "101"));
    await db.client
      .update(recallDerivationState)
      .set({
        status: "FAILED",
        blocker: {
          reason: "LANGUAGE_ANALYSIS",
          retryable: true,
          message: "Second failure is not selected.",
        },
        taskProjectionRevision: 2,
      })
      .where(eq(recallDerivationState.targetId, "202"));

    const failed = await refreshRecallDerivationTask(db.client, task.id);
    expect(failed?.state.status).toBe("FAILED");
    const [failure] = await db.client
      .select({
        message: operationFailure.message,
        retryable: operationFailure.retryable,
      })
      .from(operationFailure)
      .where(eq(operationFailure.id, failed?.state.currentFailureId ?? ""));
    expect(failure).toEqual({
      message: "First failure is retained.",
      retryable: false,
    });
  });

  it("discovers a pending dependency-version revision without comparing clocks", async () => {
    await seedDemands();
    const task = await startRecallDerivationTask(db.client, {
      projectId,
      actorId,
      references: references(),
    });
    await executeCommand(
      { db: db.client },
      reconcileRecallDerivationDependency,
      {
        targetKind: "MEMORY_ITEM",
        languageId: "en",
        requiredDerivationVersion: derivation,
      },
    );
    const [state] = await db.client
      .select({
        taskProjectionRevision: recallDerivationState.taskProjectionRevision,
      })
      .from(recallDerivationState)
      .where(eq(recallDerivationState.targetId, "101"));
    expect(state?.taskProjectionRevision).toBe(2);
    expect(
      await executeQuery(
        { db: db.client },
        listRecallDerivationTasksNeedingProjection,
        { limit: 1 },
      ),
    ).toEqual([task.id]);
  });

  it("converges when state publication races Task projection", async () => {
    await seedDemands();
    const task = await startRecallDerivationTask(db.client, {
      projectId,
      actorId,
      references: references(),
    });
    const concurrent = await db.openConcurrentClient();
    try {
      let releasePublisher: (() => void) | undefined;
      let stateUpdated: (() => void) | undefined;
      const publisherGate = new Promise<void>((resolve) => {
        releasePublisher = resolve;
      });
      const stateUpdateStarted = new Promise<void>((resolve) => {
        stateUpdated = resolve;
      });
      const publisher = concurrent.client.transaction(async (tx) => {
        await tx
          .update(recallDerivationState)
          .set({
            status: "FRESH",
            requiredDerivationVersion: derivation,
            currentCanonicalInputVersion: canonical,
            currentDerivationVersion: derivation,
            taskProjectionRevision: 2,
          })
          .where(eq(recallDerivationState.targetId, "101"));
        stateUpdated?.();
        await publisherGate;
      });
      await stateUpdateStarted;
      let projectionSettled = false;
      const projection = refreshRecallDerivationTask(
        db.client,
        task.id,
      ).finally(() => {
        projectionSettled = true;
      });
      await new Promise((resolve) => setTimeout(resolve, 25));
      expect(projectionSettled).toBe(false);
      releasePublisher?.();
      await publisher;
      const observed = await projection;
      expect(observed?.state).toMatchObject({
        status: "PENDING",
        progressCurrent: 1,
        progressTotal: 2,
      });
    } finally {
      await concurrent.cleanup();
    }
    expect(
      await executeQuery(
        { db: db.client },
        listRecallDerivationTasksNeedingProjection,
        { limit: 1 },
      ),
    ).toEqual([]);
  });

  it("keeps cancel and a concurrent projection serializable", async () => {
    await seedDemands();
    const task = await startRecallDerivationTask(db.client, {
      projectId,
      actorId,
      references: references(),
    });
    const [firstClient, secondClient] = await Promise.all([
      db.openConcurrentClient(),
      db.openConcurrentClient(),
    ]);
    try {
      await Promise.all([
        executeCommand(
          { db: firstClient.client },
          requestRecallDerivationTaskCancel,
          {
            taskId: task.id,
            expectedRevision: task.state.revision,
            requestId: crypto.randomUUID(),
          },
        ),
        refreshRecallDerivationTask(secondClient.client, task.id),
      ]);
    } finally {
      await Promise.all([firstClient.cleanup(), secondClient.cleanup()]);
    }
    expect(
      (await refreshRecallDerivationTask(db.client, task.id))?.state.status,
    ).toBe("CANCELED");
  });

  it("projects reversed Task batches in one canonical lock order", async () => {
    await seedDemands();
    const first = await startRecallDerivationTask(db.client, {
      projectId,
      actorId,
      references: references(),
    });
    const second = await startRecallDerivationTask(db.client, {
      projectId,
      actorId,
      references: references(),
    });
    const [left, right] = await Promise.all([
      db.openConcurrentClient(),
      db.openConcurrentClient(),
    ]);
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      const projected = await Promise.race([
        Promise.all([
          executeCommand({ db: left.client }, projectRecallDerivationTasks, {
            taskIds: [first.id, second.id],
          }),
          executeCommand({ db: right.client }, projectRecallDerivationTasks, {
            taskIds: [second.id, first.id],
          }),
        ]),
        new Promise<never>((_, reject) => {
          timeout = setTimeout(
            () => reject(new Error("Recall Task batch projection deadlocked.")),
            2_000,
          );
        }),
      ]);
      expect(projected).toHaveLength(2);
      expect(projected.flat()).toHaveLength(4);
    } finally {
      if (timeout !== undefined) clearTimeout(timeout);
      await Promise.all([left.cleanup(), right.cleanup()]);
    }
  });

  it("creates an observing Task while another projector waits on the same states", async () => {
    await seedDemands();
    const existing = await startRecallDerivationTask(db.client, {
      projectId,
      actorId,
      references: references(),
    });
    const [holderClient, creatorClient, projectorClient] = await Promise.all([
      db.openConcurrentClient(),
      db.openConcurrentClient(),
      db.openConcurrentClient(),
    ]);
    let release: (() => void) | undefined;
    let locked: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const stateLocked = new Promise<void>((resolve) => {
      locked = resolve;
    });
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      const holder = holderClient.client.transaction(async (tx) => {
        await tx.execute(
          sql`SELECT id FROM "RecallDerivationState" ORDER BY id FOR UPDATE`,
        );
        locked?.();
        await gate;
      });
      await stateLocked;
      const work = Promise.all([
        startRecallDerivationTask(creatorClient.client, {
          projectId,
          actorId,
          references: references(),
        }),
        refreshRecallDerivationTask(projectorClient.client, existing.id),
      ]);
      await new Promise((resolve) => setTimeout(resolve, 25));
      release?.();
      const [created, projected] = await Promise.race([
        work,
        new Promise<never>((_, reject) => {
          timeout = setTimeout(
            () => reject(new Error("create/project Recall Task deadlocked.")),
            2_000,
          );
        }),
      ]);
      await holder;
      expect(created.id).not.toBe(existing.id);
      expect(projected?.id).toBe(existing.id);
    } finally {
      if (timeout !== undefined) clearTimeout(timeout);
      release?.();
      await Promise.all([
        holderClient.cleanup(),
        creatorClient.cleanup(),
        projectorClient.cleanup(),
      ]);
    }
  });

  it("lists only stale task snapshots for bounded projection reconciliation", async () => {
    await seedDemands();
    const task = await startRecallDerivationTask(db.client, {
      projectId,
      actorId,
      references: references(),
    });
    expect(
      await executeQuery(
        { db: db.client },
        listRecallDerivationTasksNeedingProjection,
        { limit: 1 },
      ),
    ).toEqual([]);
    await db.client
      .update(recallDerivationState)
      .set({
        status: "BLOCKED",
        taskProjectionRevision: 2,
        blocker: {
          reason: "LANGUAGE_ANALYSIS",
          retryable: true,
          message: "Unavailable.",
        },
      })
      .where(eq(recallDerivationState.targetId, "101"));
    expect(
      await executeQuery(
        { db: db.client },
        listRecallDerivationTasksNeedingProjection,
        { limit: 1 },
      ),
    ).toEqual([task.id]);
    await db.client
      .update(recallDerivationState)
      .set({ taskProjectionRevision: 2 })
      .where(eq(recallDerivationState.targetId, "101"));
    await refreshRecallDerivationTask(db.client, task.id);
    expect(
      await executeQuery(
        { db: db.client },
        listRecallDerivationTasksNeedingProjection,
        { limit: 1 },
      ),
    ).toEqual([]);
  });
});
