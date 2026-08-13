import { randomUUID } from "node:crypto";

import {
  createAgentDefinition,
  createAgentRun,
  createAgentSession,
  createUser,
  executeCommand,
  executeQuery,
  getAgentSessionByExternalId,
  getAgentRunInternalId,
  saveAgentRunSnapshot,
} from "@cat/domain";
import { setupTestDB, sql, type TestDB } from "@cat/test-utils";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { InProcessEventBus } from "#/graph/event-bus.ts";
import { QueuedExecutorPool } from "#/graph/executor-pool.ts";
import { GraphRegistry } from "#/graph/graph-registry.ts";
import { NodeRegistry } from "#/graph/node-registry.ts";
import {
  Scheduler,
  WorkflowRunOwnershipConflictError,
} from "#/graph/scheduler.ts";
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
      nodes: {
        start: { id: "start", type: "transform", config: {}, timeoutMs: 5_000 },
      },
      edges: [],
      entry: "start",
    },
    deduplicationKey: options?.deduplicationKey,
  });
  return {
    ...run,
    sessionDbId: sessionRow.id,
    sessionExternalId: session.sessionId,
  };
};

const createDeferred = <T = void>(): {
  promise: Promise<T>;
  resolve: (value?: T | PromiseLike<T>) => void;
} => {
  let resolve: ((value: T | PromiseLike<T>) => void) | undefined;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return {
    promise,
    resolve: (value) => {
      if (value === undefined) {
        resolve?.(undefined as T);
        return;
      }
      resolve?.(value);
    },
  };
};

const expireRunOwnership = async (runId: string): Promise<void> => {
  await db.client.execute(sql`
    UPDATE "AgentRun"
    SET owner_lease_expires_at = clock_timestamp() - interval '1 second'
    WHERE external_id = ${runId}
  `);
};

describe("PostgresCheckpointer owner fencing", () => {
  it("keeps a sessionless run ephemeral even when metadata resembles a session", async () => {
    const session = await createRun();
    const runId = randomUUID();
    const graph: GraphDefinition = {
      id: `ephemeral-run-${randomUUID()}`,
      version: "1.0.0",
      entry: "entry",
      nodes: {
        entry: { id: "entry", type: "transform", timeoutMs: 5_000 },
      },
      edges: [],
    };
    const eventBus = new InProcessEventBus();
    const graphRegistry = new GraphRegistry();
    const nodeRegistry = new NodeRegistry();
    graphRegistry.register(graph);
    nodeRegistry.register("transform", async () => ({ status: "completed" }));
    const checkpointer = new PostgresCheckpointer(db.client);
    const scheduler = new Scheduler({
      eventBus,
      checkpointer,
      executorPool: new QueuedExecutorPool({ maxConcurrency: 1 }),
      graphRegistry,
      nodeRegistry,
    });

    try {
      const ended = eventBus.waitFor({
        type: "run:end",
        timeoutMs: 2_000,
        predicate: (event) => event.runId === runId,
      });
      await scheduler.start(
        graph.id,
        {},
        {
          preallocatedRunId: runId,
          metadata: { sessionId: session.sessionDbId },
        },
      );

      expect((await ended).payload.status).toBe("completed");
      expect(await checkpointer.loadRunMetadata(runId)).toBeNull();
      expect(
        await executeQuery({ db: db.client }, getAgentRunInternalId, {
          externalId: runId,
        }),
      ).toBeNull();
      expect(checkpointer.getRunOwnershipFence(runId)).toBeNull();
      expect(scheduler.hasRun(runId)).toBe(false);
    } finally {
      await scheduler.dispose();
    }
  });

  it("allows only one scheduler to execute a deduplicated preallocated run", async () => {
    const session = await createRun();
    const graph: GraphDefinition = {
      id: `atomic-scheduler-${randomUUID()}`,
      version: "1.0.0",
      entry: "start",
      nodes: {
        start: { id: "start", type: "transform", timeoutMs: 5_000 },
      },
      edges: [],
    };
    const deduplicationKey = `atomic-scheduler:${randomUUID()}`;
    const runA = randomUUID();
    const runB = randomUUID();
    const other = await db.openConcurrentClient();
    const winnerStarted = createDeferred();
    const releaseWinner = createDeferred();
    let executions = 0;
    const createScheduler = (checkpointer: PostgresCheckpointer) => {
      const eventBus = new InProcessEventBus();
      const graphRegistry = new GraphRegistry();
      const nodeRegistry = new NodeRegistry();
      graphRegistry.register(graph);
      nodeRegistry.register("transform", async () => {
        executions += 1;
        winnerStarted.resolve();
        await releaseWinner.promise;
        return { status: "completed" };
      });
      return new Scheduler({
        eventBus,
        checkpointer,
        executorPool: new QueuedExecutorPool({ maxConcurrency: 1 }),
        graphRegistry,
        nodeRegistry,
      });
    };
    const ownerA = new PostgresCheckpointer(db.client, { ownerLeaseMs: 1_000 });
    const ownerB = new PostgresCheckpointer(other.client, {
      ownerLeaseMs: 1_000,
    });
    const schedulerA = createScheduler(ownerA);
    const schedulerB = createScheduler(ownerB);

    try {
      const winningStart = schedulerA.start(
        graph.id,
        {},
        {
          preallocatedRunId: runA,
          sessionId: session.sessionDbId,
          deduplicationKey,
        },
      );
      await winnerStarted.promise;

      await expect(
        schedulerB.start(
          graph.id,
          {},
          {
            preallocatedRunId: runB,
            sessionId: session.sessionDbId,
            deduplicationKey,
          },
        ),
      ).rejects.toBeInstanceOf(WorkflowRunOwnershipConflictError);
      releaseWinner.resolve();
      const winnerRunId = await winningStart;

      await expect.poll(() => executions).toBe(1);
      expect(await ownerA.loadSnapshot(winnerRunId)).not.toBeNull();
      const events = await ownerA.listEvents(winnerRunId);
      expect(events.filter((event) => event.type === "run:start")).toHaveLength(
        1,
      );
      expect(
        events.filter((event) => event.type === "node:start"),
      ).toHaveLength(1);
      expect(
        await ownerA.loadSnapshot(runA === winnerRunId ? runB : runA),
      ).toBeNull();
    } finally {
      releaseWinner.resolve();
      await schedulerA.dispose();
      await schedulerB.dispose();
      await other.cleanup();
    }
  });

  it("recovers an expired known run through a new owner epoch and fences the stale owner", async () => {
    const session = await createRun();
    const runId = randomUUID();
    const graph: GraphDefinition = {
      id: `expired-known-run-${randomUUID()}`,
      version: "1.0.0",
      entry: "start",
      nodes: {
        start: { id: "start", type: "transform", timeoutMs: 5_000 },
      },
      edges: [],
    };
    const staleOwner = new PostgresCheckpointer(db.client, {
      ownerLeaseMs: 50,
    });
    const initial = await staleOwner.createOrClaimRunOwnership({
      runId,
      sessionId: session.sessionDbId,
      graphId: graph.id,
      graphDefinition: graph,
      metadata: { sessionId: session.sessionDbId },
      startedAt: new Date().toISOString(),
    });
    if (initial.kind !== "claimed") throw new Error("Expected initial owner.");
    await staleOwner.saveSnapshot(runId, {
      runId,
      version: 1,
      data: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    await expireRunOwnership(runId);

    const other = await db.openConcurrentClient();
    const newOwner = new PostgresCheckpointer(other.client, {
      ownerLeaseMs: 30_000,
    });
    const eventBus = new InProcessEventBus();
    const graphRegistry = new GraphRegistry();
    const nodeRegistry = new NodeRegistry();
    graphRegistry.register(graph);
    nodeRegistry.register("transform", async () => ({ status: "completed" }));
    const scheduler = new Scheduler({
      eventBus,
      checkpointer: newOwner,
      executorPool: new QueuedExecutorPool({ maxConcurrency: 1 }),
      graphRegistry,
      nodeRegistry,
    });
    try {
      const ended = eventBus.waitFor({
        type: "run:end",
        timeoutMs: 2_000,
        predicate: (event) => event.runId === runId,
      });
      await scheduler.recover(runId);
      expect((await ended).payload.status).toBe("completed");
      expect(newOwner.getRunOwnershipFence(runId)?.epoch).toBe(
        initial.ownershipFence?.epoch === undefined
          ? 2
          : initial.ownershipFence.epoch + 1,
      );
      await expect(
        staleOwner.saveSnapshot(runId, {
          runId,
          version: 2,
          data: { stale: true },
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }),
      ).rejects.toThrow(/owner lease lost/i);
    } finally {
      await scheduler.dispose();
      await other.cleanup();
    }
  });

  it("atomically creates or claims a preallocated run without letting a live owner metadata be overwritten", async () => {
    const session = await createRun();
    const runId = randomUUID();
    const graphDefinition: GraphDefinition = {
      id: "atomic-known-run",
      version: "1.0.0",
      nodes: {
        start: { id: "start", type: "transform", config: {}, timeoutMs: 5_000 },
      },
      edges: [],
      entry: "start",
    };
    const ownerA = new PostgresCheckpointer(db.client, {
      ownerLeaseMs: 1_000,
    });
    const other = await db.openConcurrentClient();
    try {
      const ownerB = new PostgresCheckpointer(other.client, {
        ownerLeaseMs: 1_000,
      });
      const [first, second] = await Promise.all([
        ownerA.createOrClaimRunOwnership({
          runId,
          sessionId: session.sessionDbId,
          graphId: graphDefinition.id,
          graphDefinition,
          deduplicationKey: `atomic-known-run:${runId}`,
          metadata: { source: "owner-a", sessionId: session.sessionDbId },
          startedAt: new Date().toISOString(),
        }),
        ownerB.createOrClaimRunOwnership({
          runId,
          sessionId: session.sessionDbId,
          graphId: graphDefinition.id,
          graphDefinition,
          deduplicationKey: `atomic-known-run:${runId}`,
          metadata: { source: "owner-b", sessionId: session.sessionDbId },
          startedAt: new Date().toISOString(),
        }),
      ]);

      expect(
        [first, second].filter((claim) => claim.kind === "claimed"),
      ).toHaveLength(1);
      expect(
        [first, second].filter((claim) => claim.kind === "conflict"),
      ).toHaveLength(1);
      expect(
        await executeQuery({ db: db.client }, getAgentRunInternalId, {
          externalId: runId,
        }),
      ).not.toBeNull();

      const winner = first.kind === "claimed" ? first : second;
      const loser = first.kind === "conflict" ? ownerA : ownerB;
      const winnerSource = first.kind === "claimed" ? "owner-a" : "owner-b";
      if (winner.kind !== "claimed") {
        throw new Error("Expected one scheduler owner.");
      }
      expect(winner.metadata.metadata).toEqual({
        source: winnerSource,
        sessionId: session.sessionDbId,
      });

      await expect(
        loser.saveRunMetadata(runId, {
          ...winner.metadata,
          metadata: { source: "loser" },
        }),
      ).rejects.toThrow(/owner lease/i);
      expect((await ownerA.loadRunMetadata(runId))?.metadata).toEqual({
        source: winnerSource,
        sessionId: session.sessionDbId,
      });
    } finally {
      await other.cleanup();
    }
  });

  it("rejects a preallocated external id and deduplication key resolving to different runs", async () => {
    const deduplicationKey = `dedupe:${randomUUID()}`;
    const externalIdentity = await createRun({
      deduplicationKey: `external:${randomUUID()}`,
    });
    const deduplicationIdentity = await createRun({
      deduplicationKey,
    });
    const checkpointer = new PostgresCheckpointer(db.client);

    const claim = await checkpointer.createOrClaimRunOwnership({
      runId: externalIdentity.runId,
      sessionId: externalIdentity.sessionDbId,
      graphId: "owner-fence",
      graphDefinition: {
        id: "owner-fence",
        version: "1.0.0",
        nodes: {},
        edges: [],
        entry: "start",
      },
      deduplicationKey,
      metadata: { sessionId: externalIdentity.sessionDbId },
      startedAt: new Date().toISOString(),
    });

    expect(claim).toEqual({
      kind: "identity-conflict",
      externalIdRunId: externalIdentity.runId,
      deduplicationKeyRunId: deduplicationIdentity.runId,
    });
  });

  it("cannot renew or write through an expired epoch before takeover", async () => {
    const run = await createRun();
    const owner = new PostgresCheckpointer(db.client, { ownerLeaseMs: 50 });
    expect(await owner.claimRunOwnership(run.runId)).toBe(true);

    await expireRunOwnership(run.runId);

    expect(await owner.renewRunOwnership(run.runId)).toBe(false);
    await expect(
      owner.saveSnapshot(run.runId, {
        runId: run.runId,
        version: 1,
        data: {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }),
    ).rejects.toThrow(/owner lease lost/i);
  });

  it("increments the epoch when the same owner reclaims an expired lease", async () => {
    const run = await createRun();
    const owner = new PostgresCheckpointer(db.client, { ownerLeaseMs: 50 });
    expect(await owner.claimRunOwnership(run.runId)).toBe(true);
    const staleFence = owner.getRunOwnershipFence(run.runId);
    expect(staleFence).not.toBeNull();

    await expireRunOwnership(run.runId);

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
    ).rejects.toThrow(/owner lease lost/i);
  });

  it("rejects a live-owner takeover and fences every stale persistence write after expiry", async () => {
    const run = await createRun();
    const ownerA = new PostgresCheckpointer(db.client, { ownerLeaseMs: 100 });
    const ownerB = new PostgresCheckpointer(db.client, {
      ownerLeaseMs: 30_000,
    });
    expect(await ownerA.claimRunOwnership(run.runId)).toBe(true);
    expect(await ownerB.claimRunOwnership(run.runId)).toBe(false);

    await expireRunOwnership(run.runId);
    expect(await ownerB.claimRunOwnership(run.runId)).toBe(true);

    const snapshot = {
      runId: run.runId,
      version: 1,
      data: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await expect(ownerA.saveSnapshot(run.runId, snapshot)).rejects.toThrow(
      /owner lease lost/i,
    );
    await expect(
      ownerA.saveEvent({
        eventId: randomUUID(),
        runId: run.runId,
        type: "run:error",
        timestamp: new Date().toISOString(),
        payload: { error: "stale" },
      }),
    ).rejects.toThrow(/owner lease lost/i);
    await expect(
      ownerA.saveExternalOutput({
        runId: run.runId,
        nodeId: "start",
        outputType: "db_write",
        outputKey: "stale",
        payload: {},
        createdAt: new Date().toISOString(),
      }),
    ).rejects.toThrow(/owner lease lost/i);

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
    ).rejects.toThrow(/owner lease lost/i);
    await expect(
      owner.saveEvent({
        eventId: randomUUID(),
        runId: run.runId,
        type: "run:error",
        timestamp: new Date().toISOString(),
        payload: { error: "late" },
      }),
    ).rejects.toThrow(/owner lease lost/i);
    await expect(
      owner.saveEvent({
        eventId: randomUUID(),
        runId: run.runId,
        type: "run:end",
        timestamp: new Date().toISOString(),
        payload: { status: "failed" },
      }),
    ).rejects.toThrow(/owner lease lost/i);
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

  it("discards an unstarted allocation after activation throws so the same run id can retry", async () => {
    const session = await createRun();
    const graph: GraphDefinition = {
      id: `activation-cleanup-${randomUUID()}`,
      version: "1.0.0",
      entry: "entry",
      nodes: {
        entry: { id: "entry", type: "transform", timeoutMs: 5_000 },
      },
      edges: [],
    };
    const eventBus = new InProcessEventBus();
    const graphRegistry = new GraphRegistry();
    const nodeRegistry = new NodeRegistry();
    graphRegistry.register(graph);
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
    const runId = randomUUID();

    try {
      await expect(
        scheduler.start(
          graph.id,
          {},
          {
            preallocatedRunId: runId,
            sessionId: session.sessionDbId,
            onRunActivated: async () => {
              throw new Error("activation callback failed");
            },
          },
        ),
      ).rejects.toThrow("activation callback failed");
      expect(await checkpointer.loadRunMetadata(runId)).toBeNull();
      expect(
        await executeQuery({ db: db.client }, getAgentRunInternalId, {
          externalId: runId,
        }),
      ).toBeNull();
      const persistedSession = await executeQuery(
        { db: db.client },
        getAgentSessionByExternalId,
        { externalId: session.sessionExternalId },
      );
      expect(persistedSession?.currentRunId).toBeNull();
      expect(scheduler.hasRun(runId)).toBe(false);

      const ended = eventBus.waitFor({
        type: "run:end",
        timeoutMs: 2_000,
        predicate: (event) => event.runId === runId,
      });
      await scheduler.start(
        graph.id,
        {},
        {
          preallocatedRunId: runId,
          sessionId: session.sessionDbId,
        },
      );
      expect((await ended).payload.status).toBe("completed");
    } finally {
      await scheduler.dispose();
    }
  });
});
