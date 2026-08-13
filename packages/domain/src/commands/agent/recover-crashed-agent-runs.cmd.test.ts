import { randomUUID } from "node:crypto";

import { agentEvent, agentRun, eq, sql, workflowTaskDispatch } from "@cat/db";
import { BatchAutoTranslationInvocationSchema } from "@cat/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  createAgentDefinition,
  createAgentRun,
  createAgentSession,
  createWorkflowTaskWithDispatch,
  createUser,
  executeCommand,
} from "#/index.ts";
import { setupTestDB, type TestDB } from "#/testing/setup-test-db.ts";

import {
  createCrashRecoveryEventId,
  recoverCrashedAgentRuns,
} from "./recover-crashed-agent-runs.cmd.ts";

let testDb: TestDB;

beforeAll(async () => {
  testDb = await setupTestDB();
});

afterAll(async () => {
  await testDb?.cleanup();
});

const graphDefinition = {
  id: "crash-recovery-test",
  version: "1.0.0",
  nodes: {
    start: { id: "start", type: "transform", config: {} },
  },
  edges: [],
  entry: "start",
};

const createRunFixture = async (
  status: string,
  options: { currentNodeId?: string; externalId?: string } = {},
) => {
  const user = await executeCommand({ db: testDb.client }, createUser, {
    email: `crash-${randomUUID()}@example.com`,
    name: "Crash Recovery",
  });
  const definition = await executeCommand(
    { db: testDb.client },
    createAgentDefinition,
    {
      name: `Crash Recovery ${randomUUID()}`,
      description: "",
      scopeType: "GLOBAL",
      scopeId: "",
      definitionId: "crash-recovery-test",
      version: "1.0.0",
      type: "GENERAL",
      tools: [],
      content: "test",
      isBuiltin: false,
    },
  );
  const session = await executeCommand(
    { db: testDb.client },
    createAgentSession,
    {
      agentDefinitionId: definition.id,
      userId: user.id,
    },
  );
  const run = await executeCommand({ db: testDb.client }, createAgentRun, {
    sessionId: session.sessionId,
    graphDefinition,
    ...(options.externalId === undefined
      ? {}
      : { externalId: options.externalId }),
  });

  if (status !== "running" || options.currentNodeId) {
    await testDb.client
      .update(agentRun)
      .set({
        status,
        currentNodeId: options.currentNodeId,
        completedAt:
          status === "paused" || status === "running" ? null : new Date(),
      })
      .where(eq(agentRun.externalId, run.runId));
  }

  return run;
};

const createDispatch = async (status: "CLAIMED" | "RUNNING" | "CANCELLING") => {
  const user = await executeCommand({ db: testDb.client }, createUser, {
    email: `dispatch-${randomUUID()}@example.com`,
    name: "Dispatch Recovery",
  });
  const projectId = randomUUID();
  const service = (serviceType: "VECTOR_STORAGE" | "TEXT_VECTORIZER") => ({
    pluginId: `test.${serviceType.toLowerCase()}`,
    serviceId: "default",
    serviceType,
    scopeType: "GLOBAL" as const,
    scopeId: "" as const,
  });
  const created = await executeCommand(
    { db: testDb.client },
    createWorkflowTaskWithDispatch,
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
    },
  );
  await testDb.client
    .update(workflowTaskDispatch)
    .set({
      status,
      ownerId: randomUUID(),
      ownerEpoch: 1,
      ownerLeaseExpiresAt: sql`clock_timestamp() + interval '1 minute'`,
    })
    .where(eq(workflowTaskDispatch.id, created.dispatch.id));
  return created.dispatch;
};

describe("recoverCrashedAgentRuns", () => {
  it("marks persisted running runs failed and writes one run:error event", async () => {
    const recoveredAt = new Date("2026-05-24T10:00:00.000Z");
    const running = await createRunFixture("running", {
      currentNodeId: "node-active",
    });
    const paused = await createRunFixture("paused");
    const completed = await createRunFixture("completed");

    const result = await executeCommand(
      { db: testDb.client },
      recoverCrashedAgentRuns,
      { recoveredAt },
    );

    expect(result.recoveredRunIds).toEqual([running.runId]);

    const rows = await testDb.client
      .select({
        externalId: agentRun.externalId,
        status: agentRun.status,
        completedAt: agentRun.completedAt,
        currentNodeId: agentRun.currentNodeId,
      })
      .from(agentRun)
      .where(eq(agentRun.externalId, running.runId));

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      externalId: running.runId,
      status: "failed",
      completedAt: recoveredAt,
      currentNodeId: null,
    });

    const pausedRows = await testDb.client
      .select({ status: agentRun.status, completedAt: agentRun.completedAt })
      .from(agentRun)
      .where(eq(agentRun.externalId, paused.runId));

    expect(pausedRows).toHaveLength(1);
    expect(pausedRows[0]).toMatchObject({
      status: "paused",
      completedAt: null,
    });

    const completedRows = await testDb.client
      .select({ status: agentRun.status })
      .from(agentRun)
      .where(eq(agentRun.externalId, completed.runId));

    expect(completedRows[0]?.status).toBe("completed");

    const events = await testDb.client
      .select({
        runId: agentEvent.runId,
        eventId: agentEvent.eventId,
        type: agentEvent.type,
        payload: agentEvent.payload,
        timestamp: agentEvent.timestamp,
      })
      .from(agentEvent)
      .where(eq(agentEvent.runId, running.runDbId));

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      runId: running.runDbId,
      type: "run:error",
      eventId: createCrashRecoveryEventId(running.runId),
      payload: { error: "Process exited while run was active" },
      timestamp: recoveredAt,
    });
  });

  it("is idempotent when run twice", async () => {
    const running = await createRunFixture("running");

    await executeCommand({ db: testDb.client }, recoverCrashedAgentRuns, {});
    await executeCommand({ db: testDb.client }, recoverCrashedAgentRuns, {});

    const events = await testDb.client
      .select({ type: agentEvent.type })
      .from(agentEvent)
      .where(eq(agentEvent.runId, running.runDbId));

    expect(events.filter((event) => event.type === "run:error")).toHaveLength(
      1,
    );
  });

  it("does not fail running runs still held by the current process", async () => {
    const running = await createRunFixture("running");

    const result = await executeCommand(
      { db: testDb.client },
      recoverCrashedAgentRuns,
      { activeRunIds: [running.runId] },
    );

    expect(result.recoveredRunIds).toEqual([]);

    const rows = await testDb.client
      .select({ status: agentRun.status, completedAt: agentRun.completedAt })
      .from(agentRun)
      .where(eq(agentRun.externalId, running.runId));

    expect(rows[0]).toMatchObject({ status: "running", completedAt: null });
  });

  it("protects every live task dispatch lease and recovers expired leases", async () => {
    for (const status of ["CLAIMED", "RUNNING", "CANCELLING"] as const) {
      const liveDispatch = await createDispatch(status);
      const liveRun = await createRunFixture("running", {
        externalId: liveDispatch.runId,
      });
      const expiredDispatch = await createDispatch(status);
      const expiredRun = await createRunFixture("running", {
        externalId: expiredDispatch.runId,
      });
      await testDb.client
        .update(workflowTaskDispatch)
        .set({
          ownerLeaseExpiresAt: sql`clock_timestamp() - interval '1 second'`,
        })
        .where(eq(workflowTaskDispatch.id, expiredDispatch.id));

      const result = await executeCommand(
        { db: testDb.client },
        recoverCrashedAgentRuns,
        {},
      );

      expect(result.recoveredRunIds).not.toContain(liveRun.runId);
      expect(result.recoveredRunIds).toContain(expiredRun.runId);
      const [livePersisted] = await testDb.client
        .select({ status: agentRun.status })
        .from(agentRun)
        .where(eq(agentRun.externalId, liveRun.runId));
      const [expiredPersisted] = await testDb.client
        .select({ status: agentRun.status })
        .from(agentRun)
        .where(eq(agentRun.externalId, expiredRun.runId));
      expect(livePersisted?.status).toBe("running");
      expect(expiredPersisted?.status).toBe("failed");
    }
  });

  it("does not duplicate the crash event if a previous recovery crashed after event insert", async () => {
    const recoveredAt = new Date("2026-05-24T10:00:00.000Z");
    const running = await createRunFixture("running");

    await testDb.client.insert(agentEvent).values({
      runId: running.runDbId,
      eventId: createCrashRecoveryEventId(running.runId),
      type: "run:error",
      payload: { error: "Process exited while run was active" },
      timestamp: recoveredAt,
    });

    await executeCommand({ db: testDb.client }, recoverCrashedAgentRuns, {
      recoveredAt,
    });

    const events = await testDb.client
      .select({ type: agentEvent.type })
      .from(agentEvent)
      .where(eq(agentEvent.runId, running.runDbId));

    expect(events.filter((event) => event.type === "run:error")).toHaveLength(
      1,
    );

    const rows = await testDb.client
      .select({ status: agentRun.status })
      .from(agentRun)
      .where(eq(agentRun.externalId, running.runId));

    expect(rows[0]?.status).toBe("failed");
  });
});
