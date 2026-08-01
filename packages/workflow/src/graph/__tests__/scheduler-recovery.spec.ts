import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import { MemoryCheckpointer } from "#/graph/checkpointer/index.ts";
import { InProcessEventBus } from "#/graph/event-bus.ts";
import { QueuedExecutorPool } from "#/graph/executor-pool.ts";
import { GraphRegistry } from "#/graph/graph-registry.ts";
import { NodeRegistry } from "#/graph/node-registry.ts";
import { Scheduler } from "#/graph/scheduler.ts";
import type { GraphDefinition } from "#/graph/types.ts";

describe("Scheduler recovery", () => {
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
