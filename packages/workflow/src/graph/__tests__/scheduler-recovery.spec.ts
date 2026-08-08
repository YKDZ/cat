import { randomUUID } from "node:crypto";

import type { DbHandle } from "@cat/domain";
import { PluginManager } from "@cat/plugin-core";
import { describe, expect, it } from "vitest";

import { MemoryCheckpointer } from "#/graph/checkpointer/index.ts";
import { InProcessEventBus } from "#/graph/event-bus.ts";
import { QueuedExecutorPool } from "#/graph/executor-pool.ts";
import { GraphRegistry } from "#/graph/graph-registry.ts";
import { NodeRegistry } from "#/graph/node-registry.ts";
import { Scheduler } from "#/graph/scheduler.ts";
import type { GraphDefinition } from "#/graph/types.ts";

describe("Scheduler recovery", () => {
  it("keeps the scheduler database when a cold recovery supplies run services", async () => {
    const runId = randomUUID();
    const graph: GraphDefinition = {
      id: "cold-recovery-runtime",
      version: "1.0.0",
      entry: "entry",
      nodes: {
        entry: { id: "entry", type: "transform", timeoutMs: 5_000 },
      },
      edges: [],
    };
    const checkpointer = new MemoryCheckpointer();
    const graphRegistry = new GraphRegistry();
    graphRegistry.register(graph);
    const nodeRegistry = new NodeRegistry();
    const database = {} as DbHandle;
    const pluginManager = new PluginManager("GLOBAL", "recovery");
    let ownershipAssertions = 0;
    let executions = 0;
    nodeRegistry.register("transform", async (ctx) => {
      executions += 1;
      if (executions === 1) return { status: "paused" };

      expect(ctx.runtime.db).toBe(database);
      expect(ctx.runtime.pluginManager).toBe(pluginManager);
      return { status: "completed" };
    });

    const firstEventBus = new InProcessEventBus();
    const firstScheduler = new Scheduler({
      eventBus: firstEventBus,
      checkpointer,
      executorPool: new QueuedExecutorPool({ maxConcurrency: 1 }),
      graphRegistry,
      nodeRegistry,
    });
    const paused = firstEventBus.waitFor({
      type: "run:pause",
      timeoutMs: 2_000,
      predicate: (event) => event.runId === runId,
    });
    await firstScheduler.start(graph.id, {}, { preallocatedRunId: runId });
    await paused;
    await firstScheduler.dispose();

    const recoveredEventBus = new InProcessEventBus();
    const recoveredScheduler = new Scheduler({
      db: database,
      eventBus: recoveredEventBus,
      checkpointer,
      executorPool: new QueuedExecutorPool({ maxConcurrency: 1 }),
      graphRegistry,
      nodeRegistry,
    });
    const ended = recoveredEventBus.waitFor({
      type: "run:end",
      timeoutMs: 2_000,
      predicate: (event) => event.runId === runId,
    });

    await recoveredScheduler.recover(runId, {
      runtime: {
        pluginManager,
        assertRunOwnership: async () => {
          ownershipAssertions += 1;
        },
      },
    });
    await recoveredScheduler.resume(runId);

    expect((await ended).payload.status).toBe("completed");
    expect(ownershipAssertions).toBeGreaterThan(0);
    await recoveredScheduler.dispose();
  });

  it("keeps a recovered paused run dormant until resume", async () => {
    const runId = randomUUID();
    const graph: GraphDefinition = {
      id: "paused-recovery",
      version: "1.0.0",
      entry: "entry",
      nodes: {
        entry: { id: "entry", type: "transform", timeoutMs: 5_000 },
      },
      edges: [],
    };
    const checkpointer = new MemoryCheckpointer();
    const timestamp = new Date().toISOString();
    await checkpointer.saveRunMetadata(runId, {
      graphId: graph.id,
      graphDefinition: graph,
      status: "paused",
      currentNodeId: "entry",
      startedAt: timestamp,
      metadata: { "__scheduler.pendingNodeIds": ["entry"] },
    });
    await checkpointer.saveSnapshot(runId, {
      runId,
      version: 0,
      data: {},
      createdAt: timestamp,
      updatedAt: timestamp,
    });

    const eventBus = new InProcessEventBus();
    const graphRegistry = new GraphRegistry();
    graphRegistry.register(graph);
    const nodeRegistry = new NodeRegistry();
    let executions = 0;
    nodeRegistry.register("transform", async () => {
      executions += 1;
      return { status: "completed" };
    });
    const scheduler = new Scheduler({
      eventBus,
      checkpointer,
      executorPool: new QueuedExecutorPool({ maxConcurrency: 1 }),
      graphRegistry,
      nodeRegistry,
    });

    await scheduler.recover(runId);
    expect(scheduler.hasPausedRun(runId)).toBe(true);
    expect(executions).toBe(0);

    const ended = eventBus.waitFor({
      type: "run:end",
      timeoutMs: 2_000,
      predicate: (event) => event.runId === runId,
    });
    await scheduler.resume(runId);
    expect((await ended).payload.status).toBe("completed");
    expect(executions).toBe(1);
    await scheduler.dispose();
  });
});
