import { agentEvent, agentRun, eq } from "@cat/db";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  createAgentDefinition,
  createAgentRun,
  createAgentSession,
  createUser,
  executeCommand,
} from "@/index";
import { setupTestDB, type TestDB } from "@/testing/setup-test-db";

import {
  createCrashRecoveryEventId,
  recoverCrashedAgentRuns,
} from "./recover-crashed-agent-runs.cmd";

let testDb: TestDB;

beforeAll(async () => {
  testDb = await setupTestDB();
});

afterAll(async () => {
  await testDb.cleanup();
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
  options: { currentNodeId?: string } = {},
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
