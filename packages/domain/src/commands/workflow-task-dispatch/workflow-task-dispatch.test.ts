import { randomUUID } from "node:crypto";

import { agentRun, eq, sql, workflowTaskDispatch } from "@cat/db";
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
  createUser,
  createAgentDefinition,
  createAgentRun,
  createAgentSession,
  getAgentSessionByExternalId,
  claimAgentRunOwner,
  executeCommand,
  executeQuery,
  getLocalizationTaskForWorkflow,
  getLatestWorkflowTaskDispatch,
  getLiveWorkflowTaskDispatchOwnedByFence,
  listLiveWorkflowTaskDispatchesOwnedBy,
  renewAgentRunOwner,
  saveAgentRunSnapshot,
  type CreateLocalizationTaskCommand,
} from "#/index.ts";
import { setupTestDB, type TestDB } from "#/testing/setup-test-db.ts";

import { runWithCleanup } from "./run-with-cleanup.ts";
import {
  createWorkflowTaskWithDispatch,
  activateWorkflowTaskDispatch,
  claimWorkflowTaskDispatch,
  requestWorkflowTaskDispatchCancel,
  acquireWorkflowTaskDispatchRunOwnership,
  renewWorkflowTaskDispatch,
  settleWorkflowTaskDispatchCancellation,
} from "./workflow-task-dispatch.cmd.ts";

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

const createCommand = async (): Promise<CreateLocalizationTaskCommand> => {
  const user = await executeCommand({ db: testDb.client }, createUser, {
    email: `${randomUUID()}@example.com`,
    name: "Dispatch owner",
  });
  const projectId = randomUUID();
  const service = (serviceType: "VECTOR_STORAGE" | "TEXT_VECTORIZER") => ({
    pluginId: `test.${serviceType.toLowerCase()}`,
    serviceId: "default",
    serviceType,
    scopeType: "GLOBAL" as const,
    scopeId: "" as const,
  });
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
          memoryVectorStorage: service("VECTOR_STORAGE"),
          translationVectorStorage: service("VECTOR_STORAGE"),
          vectorizer: service("TEXT_VECTORIZER"),
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

const createOwnedAgentRun = async (input: {
  taskId: string;
  runId: string;
  ownerId: string;
  ownerEpoch: number;
  status: "cancelled" | "running";
}): Promise<void> => {
  const task = await executeQuery(
    { db: testDb.client },
    getLocalizationTaskForWorkflow,
    { taskId: input.taskId },
  );
  if (!task || !task.state.actor.id) {
    throw new Error("Workflow task actor is missing.");
  }
  const definition = await executeCommand(
    { db: testDb.client },
    createAgentDefinition,
    {
      name: `cancel-settlement-${randomUUID()}`,
      description: "Cancellation settlement test",
      scopeType: "GLOBAL",
      scopeId: "",
      definitionId: `cancel-settlement-${randomUUID()}`,
      version: "1.0.0",
      type: "WORKFLOW",
      tools: [],
      content: "",
      isBuiltin: true,
    },
  );
  const session = await executeCommand(
    { db: testDb.client },
    createAgentSession,
    {
      agentDefinitionId: definition.id,
      userId: task.state.actor.id,
      metadata: {},
    },
  );
  await executeCommand({ db: testDb.client }, createAgentRun, {
    externalId: input.runId,
    sessionId: session.sessionId,
    graphDefinition: {},
  });
  await testDb.client
    .update(agentRun)
    .set({
      status: input.status,
      ownerId: input.ownerId,
      ownerEpoch: input.ownerEpoch,
      ownerLeaseExpiresAt: sql`clock_timestamp() + interval '30 seconds'`,
    })
    .where(eq(agentRun.externalId, input.runId));
};

const createSessionForTask = async (
  taskId: string,
): Promise<{
  externalId: string;
  id: number;
}> => {
  const task = await executeQuery(
    { db: testDb.client },
    getLocalizationTaskForWorkflow,
    { taskId },
  );
  if (!task?.state.actor.id) {
    throw new Error("Workflow task actor is missing.");
  }
  const definition = await executeCommand(
    { db: testDb.client },
    createAgentDefinition,
    {
      name: `guarded-acquisition-${randomUUID()}`,
      description: "Guarded acquisition test",
      scopeType: "GLOBAL",
      scopeId: "",
      definitionId: `guarded-acquisition-${randomUUID()}`,
      version: "1.0.0",
      type: "WORKFLOW",
      tools: [],
      content: "",
      isBuiltin: true,
    },
  );
  const created = await executeCommand(
    { db: testDb.client },
    createAgentSession,
    {
      agentDefinitionId: definition.id,
      userId: task.state.actor.id,
      metadata: {},
    },
  );
  const session = await executeQuery(
    { db: testDb.client },
    getAgentSessionByExternalId,
    { externalId: created.sessionId },
  );
  if (!session) throw new Error("Agent session was not created.");
  return { externalId: session.externalId, id: session.id };
};

const guardedInput = (input: {
  dispatchId: string;
  ownerId: string;
  ownerEpoch: number;
  runId: string;
  sessionId: number;
}) => ({
  dispatchId: input.dispatchId,
  ownerId: input.ownerId,
  ownerEpoch: input.ownerEpoch,
  leaseDurationMs: 30_000,
  agentRun: {
    externalId: input.runId,
    sessionId: input.sessionId,
    status: "running" as const,
    graphDefinition: {},
    currentNodeId: null,
    deduplicationKey: `workflow-task-dispatch:${input.dispatchId}`,
    startedAt: new Date(),
    metadata: { guarded: true },
  },
});

const makeDispatchUnclaimable = async (dispatchId: string): Promise<void> => {
  await testDb.client
    .update(workflowTaskDispatch)
    .set({
      status: "SETTLED",
      settledAt: sql`clock_timestamp()`,
      updatedAt: sql`clock_timestamp()`,
    })
    .where(eq(workflowTaskDispatch.id, dispatchId));
};

afterEach(async () => {
  for (const dispatchId of claimableDispatchIds) {
    await makeDispatchUnclaimable(dispatchId);
  }
});

const createDispatchFixture = async () => {
  const created = await executeCommand(
    { db: testDb.client },
    createWorkflowTaskWithDispatch,
    await createCommand(),
  );
  claimableDispatchIds.add(created.dispatch.id);
  return created;
};

describe("workflow task dispatch owner", () => {
  it("atomically settles a requested cancellation when no AgentRun exists", async () => {
    const created = await createDispatchFixture();

    const cancelled = await executeCommand(
      { db: testDb.client },
      requestWorkflowTaskDispatchCancel,
      { taskId: created.task.id, requestId: randomUUID() },
    );
    const binding = await getLatestWorkflowTaskDispatch(
      { db: testDb.client },
      { taskId: created.task.id },
    );

    expect(cancelled.task.state.status).toBe("CANCELED");
    expect(binding?.status).toBe("SETTLED");
  });

  it("does not settle a running dispatch when its AgentRun is missing", async () => {
    const created = await createDispatchFixture();
    await testDb.client
      .update(workflowTaskDispatch)
      .set({
        status: "RUNNING",
        ownerId: randomUUID(),
        ownerEpoch: 1,
        ownerLeaseExpiresAt: sql`clock_timestamp() + interval '30 seconds'`,
      })
      .where(eq(workflowTaskDispatch.id, created.dispatch.id));

    const cancelled = await executeCommand(
      { db: testDb.client },
      requestWorkflowTaskDispatchCancel,
      { taskId: created.task.id, requestId: randomUUID() },
    );
    const binding = await getLatestWorkflowTaskDispatch(
      { db: testDb.client },
      { taskId: created.task.id },
    );

    expect(cancelled.task.state.status).toBe("CANCEL_REQUESTED");
    expect(binding?.status).toBe("CANCELLING");
  });

  it("settles with independent current dispatch and AgentRun fences", async () => {
    const created = await createDispatchFixture();
    const firstOwnerId = randomUUID();
    await createOwnedAgentRun({
      taskId: created.task.id,
      runId: created.dispatch.runId,
      ownerId: firstOwnerId,
      ownerEpoch: 1,
      status: "cancelled",
    });
    await testDb.client
      .update(workflowTaskDispatch)
      .set({
        status: "RUNNING",
        ownerId: firstOwnerId,
        ownerEpoch: 1,
        ownerLeaseExpiresAt: sql`clock_timestamp() + interval '30 seconds'`,
      })
      .where(eq(workflowTaskDispatch.id, created.dispatch.id));
    await executeCommand(
      { db: testDb.client },
      requestWorkflowTaskDispatchCancel,
      { taskId: created.task.id, requestId: randomUUID() },
    );

    await expect(
      executeCommand(
        { db: testDb.client },
        settleWorkflowTaskDispatchCancellation,
        {
          dispatchId: created.dispatch.id,
          requestId: randomUUID(),
          dispatchFence: { ownerId: randomUUID(), epoch: 1 },
          runFence: { ownerId: randomUUID(), epoch: 1 },
        },
      ),
    ).rejects.toThrow("Task revision conflict");

    await testDb.client
      .update(workflowTaskDispatch)
      .set({
        ownerLeaseExpiresAt: sql`clock_timestamp() - interval '1 second'`,
      })
      .where(eq(workflowTaskDispatch.id, created.dispatch.id));
    await expect(
      executeCommand(
        { db: testDb.client },
        settleWorkflowTaskDispatchCancellation,
        {
          dispatchId: created.dispatch.id,
          requestId: randomUUID(),
          dispatchFence: { ownerId: firstOwnerId, epoch: 1 },
          runFence: { ownerId: firstOwnerId, epoch: 1 },
        },
      ),
    ).rejects.toThrow("Task revision conflict");

    const currentOwnerId = randomUUID();
    await testDb.client
      .update(workflowTaskDispatch)
      .set({
        ownerId: currentOwnerId,
        ownerEpoch: 3,
        ownerLeaseExpiresAt: sql`clock_timestamp() + interval '30 seconds'`,
      })
      .where(eq(workflowTaskDispatch.id, created.dispatch.id));
    await testDb.client
      .update(agentRun)
      .set({
        ownerId: currentOwnerId,
        ownerEpoch: 2,
        ownerLeaseExpiresAt: sql`clock_timestamp() + interval '30 seconds'`,
      })
      .where(eq(agentRun.externalId, created.dispatch.runId));

    await expect(
      executeCommand(
        { db: testDb.client },
        settleWorkflowTaskDispatchCancellation,
        {
          dispatchId: created.dispatch.id,
          requestId: randomUUID(),
          dispatchFence: { ownerId: currentOwnerId, epoch: 3 },
          runFence: { ownerId: currentOwnerId, epoch: 1 },
        },
      ),
    ).rejects.toThrow("Workflow run has not stopped publishing");

    await expect(
      executeCommand(
        { db: testDb.client },
        settleWorkflowTaskDispatchCancellation,
        {
          dispatchId: created.dispatch.id,
          requestId: randomUUID(),
          dispatchFence: { ownerId: firstOwnerId, epoch: 1 },
          runFence: { ownerId: firstOwnerId, epoch: 1 },
        },
      ),
    ).rejects.toThrow("Task revision conflict");

    const requestId = randomUUID();
    const settled = await executeCommand(
      { db: testDb.client },
      settleWorkflowTaskDispatchCancellation,
      {
        dispatchId: created.dispatch.id,
        requestId,
        dispatchFence: { ownerId: currentOwnerId, epoch: 3 },
        runFence: { ownerId: currentOwnerId, epoch: 2 },
      },
    );
    expect(settled.state.status).toBe("CANCELED");
    await testDb.client
      .update(workflowTaskDispatch)
      .set({ ownerLeaseExpiresAt: null })
      .where(eq(workflowTaskDispatch.id, created.dispatch.id));
    await testDb.client
      .update(agentRun)
      .set({ ownerLeaseExpiresAt: null })
      .where(eq(agentRun.externalId, created.dispatch.runId));
    const beforeReplay = await executeQuery(
      { db: testDb.client },
      getLocalizationTaskForWorkflow,
      { taskId: created.task.id },
    );
    const beforeReplayDispatch = await getLatestWorkflowTaskDispatch(
      { db: testDb.client },
      { taskId: created.task.id },
    );
    const replayed = await executeCommand(
      { db: testDb.client },
      settleWorkflowTaskDispatchCancellation,
      {
        dispatchId: created.dispatch.id,
        requestId: randomUUID(),
        dispatchFence: { ownerId: currentOwnerId, epoch: 3 },
        runFence: { ownerId: currentOwnerId, epoch: 2 },
      },
    );
    const afterReplay = await executeQuery(
      { db: testDb.client },
      getLocalizationTaskForWorkflow,
      { taskId: created.task.id },
    );
    const afterReplayDispatch = await getLatestWorkflowTaskDispatch(
      { db: testDb.client },
      { taskId: created.task.id },
    );

    expect(replayed).toEqual(beforeReplay);
    expect(afterReplay).toEqual(beforeReplay);
    expect(afterReplayDispatch).toEqual(beforeReplayDispatch);
  });

  it("settles a cancelled AgentRun after a new owner takes over a cancelling dispatch", async () => {
    const created = await createDispatchFixture();
    const terminalOwnerId = randomUUID();
    await createOwnedAgentRun({
      taskId: created.task.id,
      runId: created.dispatch.runId,
      ownerId: terminalOwnerId,
      ownerEpoch: 1,
      status: "cancelled",
    });
    await testDb.client
      .update(workflowTaskDispatch)
      .set({
        status: "RUNNING",
        ownerId: terminalOwnerId,
        ownerEpoch: 1,
        ownerLeaseExpiresAt: sql`clock_timestamp() + interval '30 seconds'`,
      })
      .where(eq(workflowTaskDispatch.id, created.dispatch.id));
    await executeCommand(
      { db: testDb.client },
      requestWorkflowTaskDispatchCancel,
      { taskId: created.task.id, requestId: randomUUID() },
    );
    await testDb.client
      .update(agentRun)
      .set({
        ownerLeaseExpiresAt: sql`clock_timestamp() - interval '1 second'`,
      })
      .where(eq(agentRun.externalId, created.dispatch.runId));
    await testDb.client
      .update(workflowTaskDispatch)
      .set({
        ownerLeaseExpiresAt: sql`clock_timestamp() - interval '1 second'`,
      })
      .where(eq(workflowTaskDispatch.id, created.dispatch.id));

    const currentOwnerId = randomUUID();
    const takenOver = await executeCommand(
      { db: testDb.client },
      claimWorkflowTaskDispatch,
      {
        dispatchId: created.dispatch.id,
        ownerId: currentOwnerId,
        leaseDurationMs: 30_000,
      },
    );
    if (!takenOver) throw new Error("Expected cancelling dispatch takeover.");

    const settled = await executeCommand(
      { db: testDb.client },
      settleWorkflowTaskDispatchCancellation,
      {
        dispatchId: created.dispatch.id,
        requestId: randomUUID(),
        dispatchFence: {
          ownerId: currentOwnerId,
          epoch: takenOver.ownerEpoch,
        },
        runFence: { ownerId: terminalOwnerId, epoch: 1 },
      },
    );
    const dispatch = await getLatestWorkflowTaskDispatch(
      { db: testDb.client },
      { taskId: created.task.id },
    );

    expect(settled.state.status).toBe("CANCELED");
    expect(dispatch).toMatchObject({ status: "SETTLED" });
  });

  it("rejects a non-terminal AgentRun after dispatch takeover", async () => {
    const created = await createDispatchFixture();
    const terminalOwnerId = randomUUID();
    const currentOwnerId = randomUUID();
    await createOwnedAgentRun({
      taskId: created.task.id,
      runId: created.dispatch.runId,
      ownerId: terminalOwnerId,
      ownerEpoch: 1,
      status: "running",
    });
    await testDb.client
      .update(workflowTaskDispatch)
      .set({
        status: "CANCELLING",
        ownerId: currentOwnerId,
        ownerEpoch: 2,
        ownerLeaseExpiresAt: sql`clock_timestamp() + interval '30 seconds'`,
      })
      .where(eq(workflowTaskDispatch.id, created.dispatch.id));

    await expect(
      executeCommand(
        { db: testDb.client },
        settleWorkflowTaskDispatchCancellation,
        {
          dispatchId: created.dispatch.id,
          requestId: randomUUID(),
          dispatchFence: { ownerId: currentOwnerId, epoch: 2 },
          runFence: { ownerId: terminalOwnerId, epoch: 1 },
        },
      ),
    ).rejects.toThrow("Workflow run has not stopped publishing");
  });

  it("rejects activation after waiting past the live dispatch and run fences", async () => {
    const created = await createDispatchFixture();
    await runWithCleanup(
      async () => {
        const ownerId = randomUUID();
        await createOwnedAgentRun({
          taskId: created.task.id,
          runId: created.dispatch.runId,
          ownerId,
          ownerEpoch: 1,
          status: "running",
        });
        await testDb.client
          .update(workflowTaskDispatch)
          .set({
            status: "CLAIMED",
            ownerId,
            ownerEpoch: 1,
            ownerLeaseExpiresAt: sql`clock_timestamp() + interval '30 milliseconds'`,
          })
          .where(eq(workflowTaskDispatch.id, created.dispatch.id));
        await testDb.client
          .update(agentRun)
          .set({
            ownerLeaseExpiresAt: sql`clock_timestamp() + interval '30 milliseconds'`,
          })
          .where(eq(agentRun.externalId, created.dispatch.runId));

        const beforeTask = await executeQuery(
          { db: testDb.client },
          getLocalizationTaskForWorkflow,
          { taskId: created.task.id },
        );
        const beforeDispatch = await getLatestWorkflowTaskDispatch(
          { db: testDb.client },
          { taskId: created.task.id },
        );
        const beforeRun = await testDb.client
          .select({
            status: agentRun.status,
            ownerId: agentRun.ownerId,
            ownerEpoch: agentRun.ownerEpoch,
            ownerLeaseExpiresAt: agentRun.ownerLeaseExpiresAt,
            metadata: agentRun.metadata,
          })
          .from(agentRun)
          .where(eq(agentRun.externalId, created.dispatch.runId));
        const holder = await testDb.openConcurrentClient();
        let release: (() => void) | undefined;
        await runWithCleanup(
          async () => {
            const locked = new Promise<void>((resolve) => {
              release = resolve;
            });
            const acquiredLock = new Promise<void>((resolve) => {
              void holder.client.transaction(async (tx) => {
                await tx
                  .select({ id: agentRun.id })
                  .from(agentRun)
                  .where(eq(agentRun.externalId, created.dispatch.runId))
                  .for("update");
                resolve();
                await locked;
              });
            });
            await acquiredLock;
            const activation = executeCommand(
              { db: testDb.client },
              activateWorkflowTaskDispatch,
              {
                dispatchId: created.dispatch.id,
                dispatchFence: { ownerId, epoch: 1 },
                runFence: { ownerId, epoch: 1 },
                requestId: randomUUID(),
              },
            );
            await new Promise((resolve) => setTimeout(resolve, 60));
            release?.();
            await expect(activation).rejects.toThrow("Task revision conflict");
            await expect(
              executeQuery(
                { db: testDb.client },
                getLocalizationTaskForWorkflow,
                {
                  taskId: created.task.id,
                },
              ),
            ).resolves.toEqual(beforeTask);
            await expect(
              getLatestWorkflowTaskDispatch(
                { db: testDb.client },
                { taskId: created.task.id },
              ),
            ).resolves.toEqual(beforeDispatch);
            await expect(
              testDb.client
                .select({
                  status: agentRun.status,
                  ownerId: agentRun.ownerId,
                  ownerEpoch: agentRun.ownerEpoch,
                  ownerLeaseExpiresAt: agentRun.ownerLeaseExpiresAt,
                  metadata: agentRun.metadata,
                })
                .from(agentRun)
                .where(eq(agentRun.externalId, created.dispatch.runId)),
            ).resolves.toEqual(beforeRun);
          },
          async () => {
            release?.();
            await runWithCleanup(
              holder.cleanup,
              async () => await makeDispatchUnclaimable(created.dispatch.id),
            );
          },
        );
      },
      async () => await makeDispatchUnclaimable(created.dispatch.id),
    );
  });

  it("rejects cancellation settlement after waiting past the live dispatch and run fences", async () => {
    const created = await createDispatchFixture();
    await runWithCleanup(
      async () => {
        const ownerId = randomUUID();
        await createOwnedAgentRun({
          taskId: created.task.id,
          runId: created.dispatch.runId,
          ownerId,
          ownerEpoch: 1,
          status: "cancelled",
        });
        await testDb.client
          .update(workflowTaskDispatch)
          .set({
            status: "RUNNING",
            ownerId,
            ownerEpoch: 1,
            ownerLeaseExpiresAt: sql`clock_timestamp() + interval '30 seconds'`,
          })
          .where(eq(workflowTaskDispatch.id, created.dispatch.id));
        await executeCommand(
          { db: testDb.client },
          requestWorkflowTaskDispatchCancel,
          { taskId: created.task.id, requestId: randomUUID() },
        );
        await testDb.client
          .update(workflowTaskDispatch)
          .set({
            ownerLeaseExpiresAt: sql`clock_timestamp() + interval '30 milliseconds'`,
          })
          .where(eq(workflowTaskDispatch.id, created.dispatch.id));
        await testDb.client
          .update(agentRun)
          .set({
            ownerLeaseExpiresAt: sql`clock_timestamp() + interval '30 milliseconds'`,
          })
          .where(eq(agentRun.externalId, created.dispatch.runId));

        const beforeTask = await executeQuery(
          { db: testDb.client },
          getLocalizationTaskForWorkflow,
          { taskId: created.task.id },
        );
        const beforeDispatch = await getLatestWorkflowTaskDispatch(
          { db: testDb.client },
          { taskId: created.task.id },
        );
        const beforeRun = await testDb.client
          .select({
            status: agentRun.status,
            ownerId: agentRun.ownerId,
            ownerEpoch: agentRun.ownerEpoch,
            ownerLeaseExpiresAt: agentRun.ownerLeaseExpiresAt,
            metadata: agentRun.metadata,
          })
          .from(agentRun)
          .where(eq(agentRun.externalId, created.dispatch.runId));
        const holder = await testDb.openConcurrentClient();
        let release: (() => void) | undefined;
        await runWithCleanup(
          async () => {
            const locked = new Promise<void>((resolve) => {
              release = resolve;
            });
            const acquiredLock = new Promise<void>((resolve) => {
              void holder.client.transaction(async (tx) => {
                await tx
                  .select({ id: agentRun.id })
                  .from(agentRun)
                  .where(eq(agentRun.externalId, created.dispatch.runId))
                  .for("update");
                resolve();
                await locked;
              });
            });
            await acquiredLock;
            const settlement = executeCommand(
              { db: testDb.client },
              settleWorkflowTaskDispatchCancellation,
              {
                dispatchId: created.dispatch.id,
                requestId: randomUUID(),
                dispatchFence: { ownerId, epoch: 1 },
                runFence: { ownerId, epoch: 1 },
              },
            );
            await new Promise((resolve) => setTimeout(resolve, 60));
            release?.();
            await expect(settlement).rejects.toThrow("Task revision conflict");
            await expect(
              executeQuery(
                { db: testDb.client },
                getLocalizationTaskForWorkflow,
                {
                  taskId: created.task.id,
                },
              ),
            ).resolves.toEqual(beforeTask);
            await expect(
              getLatestWorkflowTaskDispatch(
                { db: testDb.client },
                { taskId: created.task.id },
              ),
            ).resolves.toEqual(beforeDispatch);
            await expect(
              testDb.client
                .select({
                  status: agentRun.status,
                  ownerId: agentRun.ownerId,
                  ownerEpoch: agentRun.ownerEpoch,
                  ownerLeaseExpiresAt: agentRun.ownerLeaseExpiresAt,
                  metadata: agentRun.metadata,
                })
                .from(agentRun)
                .where(eq(agentRun.externalId, created.dispatch.runId)),
            ).resolves.toEqual(beforeRun);
          },
          async () => {
            release?.();
            await runWithCleanup(
              holder.cleanup,
              async () => await makeDispatchUnclaimable(created.dispatch.id),
            );
          },
        );
      },
      async () => await makeDispatchUnclaimable(created.dispatch.id),
    );
  });

  it("reclaims an expired running binding after its owner crashes", async () => {
    const created = await createDispatchFixture();
    await testDb.client
      .update(workflowTaskDispatch)
      .set({
        status: "RUNNING",
        ownerId: randomUUID(),
        ownerEpoch: 1,
        ownerLeaseExpiresAt: sql`clock_timestamp() - interval '1 second'`,
      })
      .where(eq(workflowTaskDispatch.id, created.dispatch.id));

    const claimed = await executeCommand(
      { db: testDb.client },
      claimWorkflowTaskDispatch,
      { ownerId: randomUUID(), leaseDurationMs: 30_000 },
    );

    expect(claimed).toMatchObject({
      id: created.dispatch.id,
      status: "RUNNING",
      attemptCount: 1,
    });
  });

  it("renews RUNNING and CANCELLING leases only for their fenced owner before allowing takeover", async () => {
    const other = await testDb.openConcurrentClient();
    try {
      for (const status of ["RUNNING", "CANCELLING"] as const) {
        const created = await createDispatchFixture();
        const ownerId = randomUUID();
        const ownerEpoch = 4;
        await testDb.client
          .update(workflowTaskDispatch)
          .set({
            status,
            ownerId,
            ownerEpoch,
            attemptCount: 7,
            ownerLeaseExpiresAt: sql`clock_timestamp() + interval '40 milliseconds'`,
          })
          .where(eq(workflowTaskDispatch.id, created.dispatch.id));

        await new Promise((resolve) => setTimeout(resolve, 20));
        await expect(
          executeCommand({ db: testDb.client }, renewWorkflowTaskDispatch, {
            dispatchId: created.dispatch.id,
            ownerId: randomUUID(),
            ownerEpoch,
            leaseDurationMs: 100,
          }),
        ).resolves.toBe(false);
        await expect(
          executeCommand({ db: testDb.client }, renewWorkflowTaskDispatch, {
            dispatchId: created.dispatch.id,
            ownerId,
            ownerEpoch,
            leaseDurationMs: 100,
          }),
        ).resolves.toBe(true);
        await new Promise((resolve) => setTimeout(resolve, 50));
        await expect(
          executeCommand({ db: other.client }, claimWorkflowTaskDispatch, {
            dispatchId: created.dispatch.id,
            ownerId: randomUUID(),
            leaseDurationMs: 100,
          }),
        ).resolves.toBeNull();

        await testDb.client
          .update(workflowTaskDispatch)
          .set({
            ownerLeaseExpiresAt: sql`clock_timestamp() - interval '1 ms'`,
          })
          .where(eq(workflowTaskDispatch.id, created.dispatch.id));
        const reclaimed = await executeCommand(
          { db: other.client },
          claimWorkflowTaskDispatch,
          {
            dispatchId: created.dispatch.id,
            ownerId: randomUUID(),
            leaseDurationMs: 100,
          },
        );
        expect(reclaimed).toMatchObject({
          id: created.dispatch.id,
          status,
          ownerEpoch: ownerEpoch + 1,
          attemptCount: 8,
        });
      }
    } finally {
      await other.cleanup();
    }
  });

  it("rejects a stale self-owned snapshot after a newer owner takes over", async () => {
    const created = await createDispatchFixture();
    const ownerB = randomUUID();
    const ownerC = randomUUID();
    await createOwnedAgentRun({
      taskId: created.task.id,
      runId: created.dispatch.runId,
      ownerId: ownerB,
      ownerEpoch: 3,
      status: "running",
    });
    await testDb.client
      .update(workflowTaskDispatch)
      .set({
        status: "CLAIMED",
        ownerId: ownerB,
        ownerEpoch: 7,
        attemptCount: 4,
        ownerLeaseExpiresAt: sql`clock_timestamp() + interval '30 seconds'`,
      })
      .where(eq(workflowTaskDispatch.id, created.dispatch.id));
    await executeCommand({ db: testDb.client }, activateWorkflowTaskDispatch, {
      dispatchId: created.dispatch.id,
      dispatchFence: { ownerId: ownerB, epoch: 7 },
      runFence: { ownerId: ownerB, epoch: 3 },
      requestId: randomUUID(),
    });

    const [snapshot] = await executeQuery(
      { db: testDb.client },
      listLiveWorkflowTaskDispatchesOwnedBy,
      { ownerId: ownerB },
    );
    expect(snapshot).toMatchObject({
      id: created.dispatch.id,
      ownerId: ownerB,
      ownerEpoch: 7,
    });

    await testDb.client
      .update(workflowTaskDispatch)
      .set({ ownerLeaseExpiresAt: sql`clock_timestamp() - interval '1 ms'` })
      .where(eq(workflowTaskDispatch.id, created.dispatch.id));
    const claimed = await executeCommand(
      { db: testDb.client },
      claimWorkflowTaskDispatch,
      {
        dispatchId: created.dispatch.id,
        ownerId: ownerC,
        leaseDurationMs: 30_000,
      },
    );
    expect(claimed).toMatchObject({
      id: created.dispatch.id,
      ownerId: ownerC,
      ownerEpoch: 8,
      attemptCount: 5,
    });

    await expect(
      executeQuery(
        { db: testDb.client },
        getLiveWorkflowTaskDispatchOwnedByFence,
        {
          dispatchId: snapshot?.id ?? "",
          ownerId: ownerB,
          ownerEpoch: snapshot?.ownerEpoch ?? 0,
        },
      ),
    ).resolves.toBeNull();
    await testDb.client
      .update(agentRun)
      .set({ ownerLeaseExpiresAt: sql`clock_timestamp() - interval '1 ms'` })
      .where(eq(agentRun.externalId, created.dispatch.runId));
    await expect(
      executeCommand({ db: testDb.client }, renewAgentRunOwner, {
        externalId: created.dispatch.runId,
        ownerId: ownerB,
        epoch: 3,
        leaseDurationMs: 30_000,
      }),
    ).resolves.toBe(false);
    await expect(
      executeCommand({ db: testDb.client }, saveAgentRunSnapshot, {
        externalId: created.dispatch.runId,
        snapshot: {},
        ownerId: ownerB,
        ownerEpoch: 3,
      }),
    ).rejects.toThrow("Workflow owner lease lost");
    const runLease = await executeCommand(
      { db: testDb.client },
      claimAgentRunOwner,
      {
        externalId: created.dispatch.runId,
        ownerId: ownerC,
        leaseDurationMs: 30_000,
      },
    );
    expect(runLease).toMatchObject({ epoch: 4 });
    await expect(
      executeCommand({ db: testDb.client }, activateWorkflowTaskDispatch, {
        dispatchId: created.dispatch.id,
        dispatchFence: { ownerId: ownerC, epoch: 8 },
        runFence: { ownerId: ownerC, epoch: 4 },
        requestId: randomUUID(),
      }),
    ).resolves.toMatchObject({ cancelled: false });
    await expect(
      executeCommand({ db: testDb.client }, claimWorkflowTaskDispatch, {
        dispatchId: created.dispatch.id,
        ownerId: ownerB,
        leaseDurationMs: 30_000,
      }),
    ).resolves.toBeNull();
    const current = await executeQuery(
      { db: testDb.client },
      getLatestWorkflowTaskDispatch,
      { taskId: created.task.id },
    );
    expect(current).toMatchObject({
      ownerId: ownerC,
      ownerEpoch: 8,
      attemptCount: 5,
    });
  });

  it.each(["RUNNING", "CANCELLING"] as const)(
    "does not let a stale %s dispatch mutate AgentRun after another owner takes over",
    async (status) => {
      const created = await createDispatchFixture();
      const session = await createSessionForTask(created.task.id);
      const ownerA = randomUUID();
      const ownerB = randomUUID();
      const ownerC = randomUUID();
      await executeCommand({ db: testDb.client }, createAgentRun, {
        externalId: created.dispatch.runId,
        sessionId: session.externalId,
        graphDefinition: {},
        deduplicationKey: `workflow-task-dispatch:${created.dispatch.id}`,
      });
      await testDb.client
        .update(agentRun)
        .set({
          ownerId: ownerA,
          ownerEpoch: 7,
          ownerLeaseExpiresAt: sql`clock_timestamp() + interval '30 seconds'`,
          metadata: { preserved: status },
        })
        .where(eq(agentRun.externalId, created.dispatch.runId));
      await testDb.client
        .update(workflowTaskDispatch)
        .set({
          status,
          ownerId: ownerB,
          ownerEpoch: 3,
          agentSessionId: session.id,
          ownerLeaseExpiresAt: sql`clock_timestamp() - interval '1 ms'`,
        })
        .where(eq(workflowTaskDispatch.id, created.dispatch.id));
      const snapshot = await testDb.client
        .select({
          ownerId: agentRun.ownerId,
          ownerEpoch: agentRun.ownerEpoch,
          ownerLeaseExpiresAt: agentRun.ownerLeaseExpiresAt,
          metadata: agentRun.metadata,
        })
        .from(agentRun)
        .where(eq(agentRun.externalId, created.dispatch.runId));

      const current = await executeCommand(
        { db: testDb.client },
        claimWorkflowTaskDispatch,
        {
          dispatchId: created.dispatch.id,
          ownerId: ownerC,
          leaseDurationMs: 30_000,
        },
      );
      if (!current) throw new Error("Expected dispatch takeover.");

      await expect(
        executeCommand(
          { db: testDb.client },
          acquireWorkflowTaskDispatchRunOwnership,
          guardedInput({
            dispatchId: created.dispatch.id,
            ownerId: ownerB,
            ownerEpoch: 3,
            runId: created.dispatch.runId,
            sessionId: session.id,
          }),
        ),
      ).resolves.toBeNull();
      await expect(
        testDb.client
          .select({
            ownerId: agentRun.ownerId,
            ownerEpoch: agentRun.ownerEpoch,
            ownerLeaseExpiresAt: agentRun.ownerLeaseExpiresAt,
            metadata: agentRun.metadata,
          })
          .from(agentRun)
          .where(eq(agentRun.externalId, created.dispatch.runId)),
      ).resolves.toEqual(snapshot);

      await testDb.client
        .update(agentRun)
        .set({ ownerLeaseExpiresAt: sql`clock_timestamp() - interval '1 ms'` })
        .where(eq(agentRun.externalId, created.dispatch.runId));

      await expect(
        executeCommand(
          { db: testDb.client },
          acquireWorkflowTaskDispatchRunOwnership,
          guardedInput({
            dispatchId: current.id,
            ownerId: ownerC,
            ownerEpoch: current.ownerEpoch,
            runId: current.runId,
            sessionId: session.id,
          }),
        ),
      ).resolves.toMatchObject({
        kind: "claimed",
        ownerId: ownerC,
        runId: created.dispatch.runId,
        created: false,
      });
      await expect(
        executeCommand({ db: testDb.client }, saveAgentRunSnapshot, {
          externalId: created.dispatch.runId,
          snapshot: { stale: true },
          ownerId: ownerA,
          ownerEpoch: 7,
        }),
      ).rejects.toThrow("owner lease lost");
    },
  );

  it("prevents a stale CLAIMED owner from creating a crash-before-run AgentRun", async () => {
    const created = await createDispatchFixture();
    const session = await createSessionForTask(created.task.id);
    const ownerB = randomUUID();
    const ownerC = randomUUID();
    await testDb.client
      .update(workflowTaskDispatch)
      .set({
        status: "CLAIMED",
        ownerId: ownerB,
        ownerEpoch: 1,
        agentSessionId: session.id,
        ownerLeaseExpiresAt: sql`clock_timestamp() - interval '1 ms'`,
      })
      .where(eq(workflowTaskDispatch.id, created.dispatch.id));
    const current = await executeCommand(
      { db: testDb.client },
      claimWorkflowTaskDispatch,
      {
        dispatchId: created.dispatch.id,
        ownerId: ownerC,
        leaseDurationMs: 30_000,
      },
    );
    if (!current) throw new Error("Expected dispatch takeover.");

    await expect(
      executeCommand(
        { db: testDb.client },
        acquireWorkflowTaskDispatchRunOwnership,
        guardedInput({
          dispatchId: created.dispatch.id,
          ownerId: ownerB,
          ownerEpoch: 1,
          runId: created.dispatch.runId,
          sessionId: session.id,
        }),
      ),
    ).resolves.toBeNull();
    await expect(
      testDb.client
        .select({ id: agentRun.id })
        .from(agentRun)
        .where(eq(agentRun.externalId, created.dispatch.runId)),
    ).resolves.toEqual([]);

    await expect(
      executeCommand(
        { db: testDb.client },
        acquireWorkflowTaskDispatchRunOwnership,
        guardedInput({
          dispatchId: current.id,
          ownerId: ownerC,
          ownerEpoch: current.ownerEpoch,
          runId: current.runId,
          sessionId: session.id,
        }),
      ),
    ).resolves.toMatchObject({ kind: "claimed", created: true });
  });

  it("uses dispatch then AgentRun locks for concurrent guarded acquisitions", async () => {
    const created = await createDispatchFixture();
    const session = await createSessionForTask(created.task.id);
    const ownerId = randomUUID();
    await testDb.client
      .update(workflowTaskDispatch)
      .set({
        status: "CLAIMED",
        ownerId,
        ownerEpoch: 1,
        agentSessionId: session.id,
        ownerLeaseExpiresAt: sql`clock_timestamp() + interval '30 seconds'`,
      })
      .where(eq(workflowTaskDispatch.id, created.dispatch.id));
    const other = await testDb.openConcurrentClient();
    try {
      const input = guardedInput({
        dispatchId: created.dispatch.id,
        ownerId,
        ownerEpoch: 1,
        runId: created.dispatch.runId,
        sessionId: session.id,
      });
      const [first, second] = await Promise.all([
        executeCommand(
          { db: testDb.client },
          acquireWorkflowTaskDispatchRunOwnership,
          input,
        ),
        executeCommand(
          { db: other.client },
          acquireWorkflowTaskDispatchRunOwnership,
          input,
        ),
      ]);
      expect(first).toMatchObject({
        kind: "claimed",
        runId: input.agentRun.externalId,
      });
      expect(second).toMatchObject({
        kind: "claimed",
        runId: input.agentRun.externalId,
      });
    } finally {
      await other.cleanup();
    }
  });

  it("rolls back a waited AgentRun claim when the dispatch fence expires", async () => {
    const created = await createDispatchFixture();
    const session = await createSessionForTask(created.task.id);
    const ownerId = randomUUID();
    await executeCommand({ db: testDb.client }, createAgentRun, {
      externalId: created.dispatch.runId,
      sessionId: session.externalId,
      graphDefinition: {},
      deduplicationKey: `workflow-task-dispatch:${created.dispatch.id}`,
    });
    await testDb.client
      .update(agentRun)
      .set({ metadata: { preserved: true } })
      .where(eq(agentRun.externalId, created.dispatch.runId));
    await testDb.client
      .update(workflowTaskDispatch)
      .set({
        status: "CLAIMED",
        ownerId,
        ownerEpoch: 1,
        agentSessionId: session.id,
        ownerLeaseExpiresAt: sql`clock_timestamp() + interval '20 milliseconds'`,
      })
      .where(eq(workflowTaskDispatch.id, created.dispatch.id));

    const beforeRun = await testDb.client
      .select({
        ownerId: agentRun.ownerId,
        ownerEpoch: agentRun.ownerEpoch,
        ownerLeaseExpiresAt: agentRun.ownerLeaseExpiresAt,
        metadata: agentRun.metadata,
      })
      .from(agentRun)
      .where(eq(agentRun.externalId, created.dispatch.runId));
    const beforeSession = await executeQuery(
      { db: testDb.client },
      getAgentSessionByExternalId,
      { externalId: session.externalId },
    );
    const holder = await testDb.openConcurrentClient();
    let release: (() => void) | undefined;
    await runWithCleanup(
      async () => {
        const locked = new Promise<void>((resolve) => {
          release = resolve;
        });
        const acquiredLock = new Promise<void>((resolve) => {
          void holder.client.transaction(async (tx) => {
            await tx
              .select({ id: agentRun.id })
              .from(agentRun)
              .where(eq(agentRun.externalId, created.dispatch.runId))
              .for("update");
            resolve();
            await locked;
          });
        });
        await acquiredLock;
        const acquisition = executeCommand(
          { db: testDb.client },
          acquireWorkflowTaskDispatchRunOwnership,
          guardedInput({
            dispatchId: created.dispatch.id,
            ownerId,
            ownerEpoch: 1,
            runId: created.dispatch.runId,
            sessionId: session.id,
          }),
        );
        await new Promise((resolve) => setTimeout(resolve, 40));
        release?.();
        await expect(acquisition).resolves.toBeNull();
      },
      async () => {
        release?.();
        await runWithCleanup(
          holder.cleanup,
          async () => await makeDispatchUnclaimable(created.dispatch.id),
        );
      },
    );

    const afterSession = await executeQuery(
      { db: testDb.client },
      getAgentSessionByExternalId,
      { externalId: session.externalId },
    );
    await expect(
      testDb.client
        .select({
          ownerId: agentRun.ownerId,
          ownerEpoch: agentRun.ownerEpoch,
          ownerLeaseExpiresAt: agentRun.ownerLeaseExpiresAt,
          metadata: agentRun.metadata,
        })
        .from(agentRun)
        .where(eq(agentRun.externalId, created.dispatch.runId)),
    ).resolves.toEqual(beforeRun);
    expect(afterSession?.currentRunId).toBe(beforeSession?.currentRunId);
  });

  it("rolls back a fresh dispatch allocation when deduplication resolves elsewhere", async () => {
    const created = await createDispatchFixture();
    const expectedSession = await createSessionForTask(created.task.id);
    const otherSession = await createSessionForTask(created.task.id);
    const ownerId = randomUUID();
    const deduplicationKey = `workflow-task-dispatch:${created.dispatch.id}`;
    const otherRun = await executeCommand(
      { db: testDb.client },
      createAgentRun,
      {
        sessionId: otherSession.externalId,
        graphDefinition: {},
        deduplicationKey,
      },
    );
    await testDb.client
      .update(workflowTaskDispatch)
      .set({
        status: "CLAIMED",
        ownerId,
        ownerEpoch: 1,
        agentSessionId: expectedSession.id,
        ownerLeaseExpiresAt: sql`clock_timestamp() + interval '30 seconds'`,
      })
      .where(eq(workflowTaskDispatch.id, created.dispatch.id));

    await expect(
      executeCommand(
        { db: testDb.client },
        acquireWorkflowTaskDispatchRunOwnership,
        guardedInput({
          dispatchId: created.dispatch.id,
          ownerId,
          ownerEpoch: 1,
          runId: created.dispatch.runId,
          sessionId: expectedSession.id,
        }),
      ),
    ).resolves.toEqual({
      kind: "dispatch-identity-conflict",
      expectedRunId: created.dispatch.runId,
      actualRunId: otherRun.runId,
      expectedSessionId: expectedSession.id,
      actualSessionId: otherSession.id,
    });
    await expect(
      testDb.client
        .select({ id: agentRun.id })
        .from(agentRun)
        .where(eq(agentRun.externalId, created.dispatch.runId)),
    ).resolves.toEqual([]);
    const expected = await executeQuery(
      { db: testDb.client },
      getAgentSessionByExternalId,
      { externalId: expectedSession.externalId },
    );
    expect(expected?.currentRunId).toBeNull();
  });

  it("rejects the bound run when its persisted AgentSession differs", async () => {
    const created = await createDispatchFixture();
    const expectedSession = await createSessionForTask(created.task.id);
    const wrongSession = await createSessionForTask(created.task.id);
    const ownerId = randomUUID();
    await executeCommand({ db: testDb.client }, createAgentRun, {
      externalId: created.dispatch.runId,
      sessionId: wrongSession.externalId,
      graphDefinition: {},
      deduplicationKey: `workflow-task-dispatch:${created.dispatch.id}`,
    });
    await testDb.client
      .update(agentRun)
      .set({ metadata: { preserved: "wrong-session" } })
      .where(eq(agentRun.externalId, created.dispatch.runId));
    await testDb.client
      .update(workflowTaskDispatch)
      .set({
        status: "CLAIMED",
        ownerId,
        ownerEpoch: 1,
        agentSessionId: expectedSession.id,
        ownerLeaseExpiresAt: sql`clock_timestamp() + interval '30 seconds'`,
      })
      .where(eq(workflowTaskDispatch.id, created.dispatch.id));

    await expect(
      executeCommand(
        { db: testDb.client },
        acquireWorkflowTaskDispatchRunOwnership,
        guardedInput({
          dispatchId: created.dispatch.id,
          ownerId,
          ownerEpoch: 1,
          runId: created.dispatch.runId,
          sessionId: expectedSession.id,
        }),
      ),
    ).resolves.toEqual({
      kind: "dispatch-identity-conflict",
      expectedRunId: created.dispatch.runId,
      actualRunId: created.dispatch.runId,
      expectedSessionId: expectedSession.id,
      actualSessionId: wrongSession.id,
    });
    const [persisted] = await testDb.client
      .select({
        ownerId: agentRun.ownerId,
        ownerEpoch: agentRun.ownerEpoch,
        metadata: agentRun.metadata,
      })
      .from(agentRun)
      .where(eq(agentRun.externalId, created.dispatch.runId));
    expect(persisted).toMatchObject({
      ownerId: null,
      ownerEpoch: 0,
      metadata: { preserved: "wrong-session" },
    });
  });
});
