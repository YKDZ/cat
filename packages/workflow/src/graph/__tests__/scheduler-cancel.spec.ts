import { describe, expect, it, vi } from "vitest";

import { MemoryCheckpointer } from "#/graph/checkpointer/index.ts";
import { InMemoryCompensationRegistry } from "#/graph/compensation.ts";
import { InProcessEventBus } from "#/graph/event-bus.ts";
import { QueuedExecutorPool } from "#/graph/executor-pool.ts";
import { GraphRegistry } from "#/graph/graph-registry.ts";
import { NodeRegistry } from "#/graph/node-registry.ts";
import { Scheduler } from "#/graph/scheduler.ts";
import type { GraphDefinition } from "#/graph/types.ts";

describe("Scheduler cancellation", () => {
  it("binds the run before lifecycle events and ends it as cancelled", async () => {
    const eventBus = new InProcessEventBus();
    const graphRegistry = new GraphRegistry();
    const nodeRegistry = new NodeRegistry();
    const graph: GraphDefinition = {
      id: "cancel-test",
      version: "1.0.0",
      entry: "entry",
      nodes: { entry: { id: "entry", type: "transform", timeoutMs: 5_000 } },
      edges: [],
    };
    graphRegistry.register(graph);
    let sideEffects = 0;
    nodeRegistry.register("transform", async (ctx) => {
      await new Promise<void>((_resolve, reject) => {
        ctx.signal?.addEventListener(
          "abort",
          () => reject(ctx.signal?.reason),
          {
            once: true,
          },
        );
      });
      ctx.signal?.throwIfAborted();
      sideEffects += 1;
      return { status: "completed" };
    });
    const checkpointer = new MemoryCheckpointer();
    const scheduler = new Scheduler({
      eventBus,
      checkpointer,
      executorPool: new QueuedExecutorPool({ maxConcurrency: 1 }),
      graphRegistry,
      nodeRegistry,
    });

    let observedRunStart = false;
    let boundRunId: string | undefined;
    eventBus.subscribe("run:start", () => {
      observedRunStart = true;
    });

    const nodeStarted = eventBus.waitFor({
      type: "node:start",
      timeoutMs: 2_000,
    });
    const runId = await scheduler.start(
      graph.id,
      {},
      {
        onRunCreated: async (createdRunId) => {
          expect(observedRunStart).toBe(false);
          expect(
            await checkpointer.loadRunMetadata(createdRunId),
          ).toMatchObject({
            metadata: { localizationTaskId: "task-1" },
          });
          boundRunId = createdRunId;
        },
        metadata: { localizationTaskId: "task-1" },
      },
    );
    expect(boundRunId).toBe(runId);
    await nodeStarted;

    const ended = eventBus.waitFor({
      type: "run:end",
      timeoutMs: 2_000,
      predicate: (event) => event.runId === runId,
    });
    await scheduler.cancel(runId);
    expect((await ended).payload.status).toBe("cancelled");
    expect(sideEffects).toBe(0);
    await scheduler.dispose();
  });

  it("finalizes cancellation after a non-cooperative executor settles", async () => {
    const eventBus = new InProcessEventBus();
    const graphRegistry = new GraphRegistry();
    const nodeRegistry = new NodeRegistry();
    const graph: GraphDefinition = {
      id: "late-cancel-test",
      version: "1.0.0",
      entry: "entry",
      nodes: { entry: { id: "entry", type: "transform", timeoutMs: 5_000 } },
      edges: [],
    };
    graphRegistry.register(graph);
    let settle: (() => void) | undefined;
    let markStarted: (() => void) | undefined;
    const executorStarted = new Promise<void>((resolve) => {
      markStarted = resolve;
    });
    nodeRegistry.register("transform", async () => {
      markStarted?.();
      await new Promise<void>((resolve) => {
        settle = resolve;
      });
      return { status: "completed" };
    });
    const scheduler = new Scheduler({
      eventBus,
      checkpointer: new MemoryCheckpointer(),
      executorPool: new QueuedExecutorPool({ maxConcurrency: 1 }),
      graphRegistry,
      nodeRegistry,
      cancellationTimeoutMs: 5,
    });
    const runId = await scheduler.start(graph.id, {});
    await executorStarted;

    let ended = false;
    const runEnded = eventBus.waitFor({
      type: "run:end",
      timeoutMs: 2_000,
      predicate: (event) => event.runId === runId,
    });
    void runEnded.then(() => {
      ended = true;
      return undefined;
    });
    await scheduler.cancel(runId);
    await scheduler.cancel(runId);
    expect(ended).toBe(false);

    settle?.();
    expect((await runEnded).payload.status).toBe("cancelled");
    await scheduler.dispose();
  });

  it("replays the bind callback for a deduplicated allocated run", async () => {
    const eventBus = new InProcessEventBus();
    const graphRegistry = new GraphRegistry();
    const nodeRegistry = new NodeRegistry();
    graphRegistry.register({
      id: "dedup-bind-test",
      version: "1.0.0",
      entry: "entry",
      nodes: {
        entry: { id: "entry", type: "transform", timeoutMs: 5_000 },
      },
      edges: [],
    });
    let markExecutorStarted: (() => void) | undefined;
    const executorStarted = new Promise<void>((resolve) => {
      markExecutorStarted = resolve;
    });
    let finish: (() => void) | undefined;
    nodeRegistry.register("transform", async () => {
      markExecutorStarted?.();
      await new Promise<void>((resolve) => {
        finish = resolve;
      });
      return { status: "completed" };
    });
    const scheduler = new Scheduler({
      eventBus,
      checkpointer: new MemoryCheckpointer(),
      executorPool: new QueuedExecutorPool({ maxConcurrency: 1 }),
      graphRegistry,
      nodeRegistry,
    });
    const nodeStarted = eventBus.waitFor({
      type: "node:start",
      timeoutMs: 2_000,
    });
    const first = await scheduler.start(
      "dedup-bind-test",
      {},
      {
        deduplicationKey: "task:task-1",
      },
    );
    let rebound: string | undefined;
    const second = await scheduler.start(
      "dedup-bind-test",
      {},
      {
        deduplicationKey: "task:task-1",
        onRunCreated: async (runId) => {
          rebound = runId;
        },
      },
    );

    expect(second).toBe(first);
    expect(rebound).toBe(first);
    await nodeStarted;
    await executorStarted;
    finish?.();
    await scheduler.dispose();
  });

  it("abandons a rejected allocation without projecting a terminal run", async () => {
    const eventBus = new InProcessEventBus();
    const graphRegistry = new GraphRegistry();
    const nodeRegistry = new NodeRegistry();
    graphRegistry.register({
      id: "rejected-allocation-test",
      version: "1.0.0",
      entry: "entry",
      nodes: {
        entry: { id: "entry", type: "transform", timeoutMs: 5_000 },
      },
      edges: [],
    });
    nodeRegistry.register("transform", async () => ({ status: "completed" }));
    const checkpointer = new MemoryCheckpointer();
    const scheduler = new Scheduler({
      eventBus,
      checkpointer,
      executorPool: new QueuedExecutorPool({ maxConcurrency: 1 }),
      graphRegistry,
      nodeRegistry,
    });
    const terminalEvents: string[] = [];
    eventBus.subscribe("run:end", (event) => {
      terminalEvents.push(event.runId);
    });
    let rejectedRunId = "";

    await expect(
      scheduler.start(
        "rejected-allocation-test",
        {},
        {
          deduplicationKey: "task:rejected-allocation",
          onRunCreated: async (runId) => {
            rejectedRunId = runId;
            throw new Error("dispatch claim lost");
          },
        },
      ),
    ).rejects.toThrow("dispatch claim lost");

    expect(terminalEvents).toEqual([]);
    expect(await checkpointer.loadRunMetadata(rejectedRunId)).toMatchObject({
      status: "failed",
      deduplicationKey: undefined,
    });
    await expect(
      scheduler.start(
        "rejected-allocation-test",
        {},
        {
          deduplicationKey: "task:rejected-allocation",
        },
      ),
    ).resolves.not.toBe(rejectedRunId);
    await scheduler.dispose();
  });

  it("keeps a terminalizing run owned and ignores recovery during compensation", async () => {
    const eventBus = new InProcessEventBus();
    const graphRegistry = new GraphRegistry();
    const nodeRegistry = new NodeRegistry();
    graphRegistry.register({
      id: "terminalizing-test",
      version: "1.0.0",
      entry: "entry",
      nodes: {
        entry: { id: "entry", type: "transform", timeoutMs: 5_000 },
      },
      edges: [],
    });
    let failExecution: (() => void) | undefined;
    let markExecutionStarted: (() => void) | undefined;
    const executionStarted = new Promise<void>((resolve) => {
      markExecutionStarted = resolve;
    });
    nodeRegistry.register("transform", async () => {
      markExecutionStarted?.();
      await new Promise<void>((resolve) => {
        failExecution = resolve;
      });
      throw new Error("expected failure");
    });
    const compensationRegistry = new InMemoryCompensationRegistry();
    const scheduler = new Scheduler({
      eventBus,
      checkpointer: new MemoryCheckpointer(),
      executorPool: new QueuedExecutorPool({ maxConcurrency: 1 }),
      graphRegistry,
      nodeRegistry,
      compensationRegistry,
    });
    const runId = await scheduler.start("terminalizing-test", {});
    await executionStarted;

    let releaseCompensation: (() => void) | undefined;
    let markCompensationStarted: (() => void) | undefined;
    const compensationStarted = new Promise<void>((resolve) => {
      markCompensationStarted = resolve;
    });
    let compensationExecutions = 0;
    compensationRegistry.register({
      runId,
      handler: async () => {
        compensationExecutions += 1;
        markCompensationStarted?.();
        await new Promise<void>((resolve) => {
          releaseCompensation = resolve;
        });
      },
    });
    const ended = eventBus.waitFor({
      type: "run:end",
      timeoutMs: 2_000,
      predicate: (event) => event.runId === runId,
    });

    failExecution?.();
    await compensationStarted;
    expect(scheduler.hasRun(runId)).toBe(true);
    await scheduler.recover(runId);
    expect(compensationExecutions).toBe(1);

    releaseCompensation?.();
    expect((await ended).payload.status).toBe("failed");
    await vi.waitFor(() => {
      expect(scheduler.hasRun(runId)).toBe(false);
    });
    expect(compensationExecutions).toBe(1);
    await scheduler.dispose();
  });
});
