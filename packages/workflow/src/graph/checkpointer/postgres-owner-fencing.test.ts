import { randomUUID } from "node:crypto";

import {
  createAgentDefinition,
  createAgentRun,
  createAgentSession,
  createUser,
  executeCommand,
  executeQuery,
  getAgentSessionByExternalId,
  saveAgentRunSnapshot,
} from "@cat/domain";
import { setupTestDB, type TestDB } from "@cat/test-utils";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { InProcessEventBus } from "#/graph/event-bus.ts";
import { QueuedExecutorPool } from "#/graph/executor-pool.ts";
import { GraphRegistry } from "#/graph/graph-registry.ts";
import { NodeRegistry } from "#/graph/node-registry.ts";
import { Scheduler } from "#/graph/scheduler.ts";
import type { GraphDefinition } from "#/graph/types.ts";

import { PostgresCheckpointer } from "./postgres.ts";

let db: TestDB;

beforeAll(async () => {
  db = await setupTestDB();
});

afterAll(async () => {
  await db.cleanup();
});

const createRun = async (options?: {
  graphDefinition?: GraphDefinition;
  deduplicationKey?: string;
}) => {
  const user = await executeCommand({ db: db.client }, createUser, {
    email: `${randomUUID()}@example.com`,
    name: "Owner fence",
  });
  const definition = await executeCommand(
    { db: db.client },
    createAgentDefinition,
    {
      name: `owner-fence-${randomUUID()}`,
      description: "",
      scopeType: "GLOBAL",
      scopeId: "",
      definitionId: `owner-fence-${randomUUID()}`,
      version: "1.0.0",
      type: "WORKFLOW",
      tools: [],
      content: "",
      isBuiltin: false,
    },
  );
  const session = await executeCommand({ db: db.client }, createAgentSession, {
    agentDefinitionId: definition.id,
    userId: user.id,
  });
  const sessionRow = await executeQuery(
    { db: db.client },
    getAgentSessionByExternalId,
    { externalId: session.sessionId },
  );
  if (!sessionRow) throw new Error("Owner-fence session was not found.");
  const run = await executeCommand({ db: db.client }, createAgentRun, {
    sessionId: session.sessionId,
    graphDefinition: options?.graphDefinition ?? {
      id: "owner-fence",
      version: "1.0.0",
      nodes: { start: { id: "start", type: "transform", config: {} } },
      edges: [],
      entry: "start",
    },
    deduplicationKey: options?.deduplicationKey,
  });
  return { ...run, sessionDbId: sessionRow.id };
};

describe("PostgresCheckpointer owner fencing", () => {
  it("cannot renew or write through an expired epoch before takeover", async () => {
    const run = await createRun();
    const owner = new PostgresCheckpointer(db.client, { ownerLeaseMs: 50 });
    expect(await owner.claimRunOwnership(run.runId)).toBe(true);

    await new Promise((resolve) => setTimeout(resolve, 80));

    expect(await owner.renewRunOwnership(run.runId)).toBe(false);
    await expect(
      owner.saveSnapshot(run.runId, {
        runId: run.runId,
        version: 1,
        data: {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }),
    ).rejects.toThrow("owner lease lost");
  });

  it("increments the epoch when the same owner reclaims an expired lease", async () => {
    const run = await createRun();
    const owner = new PostgresCheckpointer(db.client, { ownerLeaseMs: 50 });
    expect(await owner.claimRunOwnership(run.runId)).toBe(true);
    const staleFence = owner.getRunOwnershipFence(run.runId);
    expect(staleFence).not.toBeNull();

    await new Promise((resolve) => setTimeout(resolve, 80));

    expect(await owner.claimRunOwnership(run.runId)).toBe(true);
    const currentFence = owner.getRunOwnershipFence(run.runId);
    expect(currentFence?.epoch).toBe((staleFence?.epoch ?? 0) + 1);

    await expect(
      executeCommand({ db: db.client }, saveAgentRunSnapshot, {
        externalId: run.runId,
        snapshot: { stale: true },
        ownerId: staleFence?.ownerId,
        ownerEpoch: staleFence?.epoch,
      }),
    ).rejects.toThrow("owner lease lost");
  });

  it("rejects a live-owner takeover and fences every stale persistence write after expiry", async () => {
    const run = await createRun();
    const ownerA = new PostgresCheckpointer(db.client, { ownerLeaseMs: 100 });
    const ownerB = new PostgresCheckpointer(db.client, { ownerLeaseMs: 100 });
    expect(await ownerA.claimRunOwnership(run.runId)).toBe(true);
    expect(await ownerB.claimRunOwnership(run.runId)).toBe(false);

    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(await ownerB.claimRunOwnership(run.runId)).toBe(true);

    const snapshot = {
      runId: run.runId,
      version: 1,
      data: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await expect(ownerA.saveSnapshot(run.runId, snapshot)).rejects.toThrow(
      "owner lease lost",
    );
    await expect(
      ownerA.saveEvent({
        eventId: randomUUID(),
        runId: run.runId,
        type: "run:error",
        timestamp: new Date().toISOString(),
        payload: { error: "stale" },
      }),
    ).rejects.toThrow("owner lease lost");
    await expect(
      ownerA.saveExternalOutput({
        runId: run.runId,
        nodeId: "start",
        outputType: "db_write",
        outputKey: "stale",
        payload: {},
        createdAt: new Date().toISOString(),
      }),
    ).rejects.toThrow("owner lease lost");

    await ownerB.saveSnapshot(run.runId, snapshot);
    await ownerB.saveEvent({
      eventId: randomUUID(),
      runId: run.runId,
      type: "run:error",
      timestamp: new Date().toISOString(),
      payload: { error: "current" },
    });
    expect(await ownerB.loadSnapshot(run.runId)).toEqual(snapshot);
  });

  it("only accepts a matching run:end event after terminal metadata commits", async () => {
    const run = await createRun();
    const owner = new PostgresCheckpointer(db.client, { ownerLeaseMs: 1_000 });
    expect(await owner.claimRunOwnership(run.runId)).toBe(true);
    await owner.saveRunMetadata(run.runId, {
      graphId: "owner-fence",
      status: "completed",
      graphDefinition: {
        id: "owner-fence",
        version: "1.0.0",
        nodes: {
          start: {
            id: "start",
            type: "transform",
            config: {},
            timeoutMs: 5_000,
          },
        },
        edges: [],
        entry: "start",
      },
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      metadata: { sessionId: run.sessionDbId },
    });

    await expect(
      owner.saveExternalOutput({
        runId: run.runId,
        nodeId: "start",
        outputType: "db_write",
        outputKey: "late",
        payload: {},
        createdAt: new Date().toISOString(),
      }),
    ).rejects.toThrow("owner lease lost");
    await expect(
      owner.saveEvent({
        eventId: randomUUID(),
        runId: run.runId,
        type: "run:error",
        timestamp: new Date().toISOString(),
        payload: { error: "late" },
      }),
    ).rejects.toThrow("owner lease lost");
    await expect(
      owner.saveEvent({
        eventId: randomUUID(),
        runId: run.runId,
        type: "run:end",
        timestamp: new Date().toISOString(),
        payload: { status: "failed" },
      }),
    ).rejects.toThrow("owner lease lost");
    await expect(
      owner.saveEvent({
        eventId: randomUUID(),
        runId: run.runId,
        type: "run:end",
        timestamp: new Date().toISOString(),
        payload: { status: "completed", blackboard: {} },
      }),
    ).resolves.toEqual(expect.any(Number));
  });

  it("repairs a metadata-only deduplicated allocation before binding it", async () => {
    const graph: GraphDefinition = {
      id: `snapshot-repair-${randomUUID()}`,
      version: "1.0.0",
      entry: "entry",
      nodes: {
        entry: { id: "entry", type: "transform", timeoutMs: 5_000 },
      },
      edges: [],
    };
    const deduplicationKey = `snapshot-repair:${randomUUID()}`;
    const run = await createRun({ graphDefinition: graph, deduplicationKey });
    const eventBus = new InProcessEventBus();
    const graphRegistry = new GraphRegistry();
    graphRegistry.register(graph);
    const nodeRegistry = new NodeRegistry();
    nodeRegistry.register("transform", async () => ({ status: "completed" }));
    const checkpointer = new PostgresCheckpointer(db.client, {
      ownerLeaseMs: 1_000,
    });
    const scheduler = new Scheduler({
      eventBus,
      checkpointer,
      executorPool: new QueuedExecutorPool({ maxConcurrency: 1 }),
      graphRegistry,
      nodeRegistry,
    });
    const ended = eventBus.waitFor({
      type: "run:end",
      timeoutMs: 2_000,
      predicate: (event) => event.runId === run.runId,
    });
    let snapshotWasDurableAtBind = false;

    const scheduledRunId = await scheduler.start(
      graph.id,
      { invocation: "persisted-task-input" },
      {
        sessionId: run.sessionDbId,
        deduplicationKey,
        onRunCreated: async (runId) => {
          const snapshot = await checkpointer.loadSnapshot(runId);
          expect(snapshot?.data).toEqual({
            invocation: "persisted-task-input",
          });
          snapshotWasDurableAtBind = true;
        },
      },
    );

    expect(scheduledRunId).toBe(run.runId);
    expect(snapshotWasDurableAtBind).toBe(true);
    expect((await ended).payload.status).toBe("completed");
    await scheduler.dispose();
  });
});
