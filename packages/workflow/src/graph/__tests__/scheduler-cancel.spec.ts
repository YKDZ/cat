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
  it("persists an activation rejection as cancelled before any snapshot or lifecycle event", async () => {
    const eventBus = new InProcessEventBus();
    const graphRegistry = new GraphRegistry();
    const nodeRegistry = new NodeRegistry();
    const graph: GraphDefinition = {
      id: "activation-rejected-run",
      version: "1.0.0",
      entry: "entry",
      nodes: {
        entry: { id: "entry", type: "transform", timeoutMs: 5_000 },
      },
      edges: [],
    };
    graphRegistry.register(graph);
    let executed = false;
    nodeRegistry.register("transform", async () => {
      executed = true;
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
    const observed: string[] = [];
    eventBus.subscribe("run:start", (event) => {
      observed.push(event.type);
    });
    eventBus.subscribe("node:start", (event) => {
      observed.push(event.type);
    });

    const runId = await scheduler.start(
      graph.id,
      {},
      {
        preallocatedRunId: "7fd2ca11-cd0e-4a06-97f6-d1de0daf4b63",
        onRunActivated: async () => false,
      },
    );

    expect((await checkpointer.loadRunMetadata(runId))?.status).toBe(
      "cancelled",
    );
    expect(await checkpointer.loadSnapshot(runId)).toBeNull();
    expect(observed).toEqual([]);
    expect(executed).toBe(false);
    expect(scheduler.hasRun(runId)).toBe(false);
    await scheduler.dispose();
  });

  it.each(["saveEvent", "run:start subscriber"] as const)(
    "marks the created run failed when %s rejects run:start publication",
    async (failureSource) => {
      const eventBus = new InProcessEventBus();
      const graphRegistry = new GraphRegistry();
      const nodeRegistry = new NodeRegistry();
      const graph: GraphDefinition = {
        id: `run-start-publication-${failureSource}`,
        version: "1.0.0",
        entry: "entry",
        nodes: {
          entry: { id: "entry", type: "transform", timeoutMs: 5_000 },
        },
        edges: [],
      };
      graphRegistry.register(graph);
      let executed = false;
      nodeRegistry.register("transform", async () => {
        executed = true;
        return { status: "completed" };
      });
      const checkpointer = new MemoryCheckpointer();
      const failure = new Error(`${failureSource} failed`);
      if (failureSource === "saveEvent") {
        vi.spyOn(checkpointer, "saveEvent").mockRejectedValue(failure);
      } else {
        eventBus.subscribe("run:start", async () => {
          throw failure;
        });
      }
      const scheduler = new Scheduler({
        eventBus,
        checkpointer,
        executorPool: new QueuedExecutorPool({ maxConcurrency: 1 }),
        graphRegistry,
        nodeRegistry,
      });
      const observed: string[] = [];
      eventBus.subscribe("run:end", (event) => {
        observed.push(event.type);
      });
      const runId = `d4b0d7a2-4e3a-42c8-8ad6-${failureSource === "saveEvent" ? "000000000001" : "000000000002"}`;

      await expect(
        scheduler.start(graph.id, {}, { preallocatedRunId: runId }),
      ).rejects.toBe(failure);

      expect((await checkpointer.loadRunMetadata(runId))?.status).toBe(
        "failed",
      );
      expect(scheduler.hasRun(runId)).toBe(false);
      expect(executed).toBe(false);
      expect(observed).toEqual([]);
      await scheduler.dispose();
    },
  );

  it("logs run:start cleanup failure while preserving the publication error", async () => {
    const eventBus = new InProcessEventBus();
    const graphRegistry = new GraphRegistry();
    const nodeRegistry = new NodeRegistry();
    const graph: GraphDefinition = {
      id: "run-start-cleanup-failure",
      version: "1.0.0",
      entry: "entry",
      nodes: {
        entry: { id: "entry", type: "transform", timeoutMs: 5_000 },
      },
      edges: [],
    };
    graphRegistry.register(graph);
    nodeRegistry.register("transform", async () => ({ status: "completed" }));
    const checkpointer = new MemoryCheckpointer();
    const publicationError = new Error("run:start subscriber failed");
    const cleanupError = new Error("failed metadata cleanup");
    eventBus.subscribe("run:start", async () => {
      throw publicationError;
    });
    vi.spyOn(checkpointer, "saveRunMetadata").mockRejectedValue(cleanupError);
    const scheduler = new Scheduler({
      eventBus,
      checkpointer,
      executorPool: new QueuedExecutorPool({ maxConcurrency: 1 }),
      graphRegistry,
      nodeRegistry,
    });
    const logged = vi.spyOn(scheduler.logger, "scheduler");

    await expect(
      scheduler.start(
        graph.id,
        {},
        {
          preallocatedRunId: "d4b0d7a2-4e3a-42c8-8ad6-000000000003",
        },
      ),
    ).rejects.toBe(publicationError);

    expect(logged).toHaveBeenCalledWith("run:start-cleanup:error", {
      runId: "d4b0d7a2-4e3a-42c8-8ad6-000000000003",
      error: cleanupError.message,
    });
    expect(scheduler.hasRun("d4b0d7a2-4e3a-42c8-8ad6-000000000003")).toBe(
      false,
    );
    await scheduler.dispose();
  });

  it("preserves the activation error when discarding its unstarted run fails", async () => {
    const eventBus = new InProcessEventBus();
    const graphRegistry = new GraphRegistry();
    const nodeRegistry = new NodeRegistry();
    const graph: GraphDefinition = {
      id: "activation-discard-failure",
      version: "1.0.0",
      entry: "entry",
      nodes: {
        entry: { id: "entry", type: "transform", timeoutMs: 5_000 },
      },
      edges: [],
    };
    graphRegistry.register(graph);
    nodeRegistry.register("transform", async () => ({ status: "completed" }));
    const checkpointer = new MemoryCheckpointer();
    const activationError = new Error("activation callback failed");
    const discardError = new Error("discard unstarted run failed");
    vi.spyOn(checkpointer, "discardUnstartedRun").mockRejectedValue(
      discardError,
    );
    const scheduler = new Scheduler({
      eventBus,
      checkpointer,
      executorPool: new QueuedExecutorPool({ maxConcurrency: 1 }),
      graphRegistry,
      nodeRegistry,
    });
    const logged = vi.spyOn(scheduler.logger, "scheduler");
    const runId = "d4b0d7a2-4e3a-42c8-8ad6-000000000004";

    await expect(
      scheduler.start(
        graph.id,
        {},
        {
          preallocatedRunId: runId,
          onRunActivated: async () => {
            throw activationError;
          },
        },
      ),
    ).rejects.toBe(activationError);

    expect(logged).toHaveBeenCalledWith("run:activation-discard:error", {
      runId,
      error: discardError.message,
    });
    expect(scheduler.hasRun(runId)).toBe(false);
    await scheduler.dispose();
  });

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

  it("recovers a preclaimed deduplicated run without claiming its fence twice", async () => {
    const eventBus = new InProcessEventBus();
    const graphRegistry = new GraphRegistry();
    const nodeRegistry = new NodeRegistry();
    const graph: GraphDefinition = {
      id: "preclaimed-dedup-recovery",
      version: "1.0.0",
      entry: "entry",
      nodes: {
        entry: { id: "entry", type: "transform", timeoutMs: 5_000 },
      },
      edges: [],
    };
    graphRegistry.register(graph);
    nodeRegistry.register("transform", async () => ({ status: "completed" }));
    const checkpointer = new MemoryCheckpointer();
    const runId = "7167af1c-2f61-4322-9d1d-fbc8df5826f0";
    const deduplicationKey = "workflow-task-dispatch:preclaimed";
    await checkpointer.createOrClaimRunOwnership({
      runId,
      graphId: graph.id,
      graphDefinition: graph,
      deduplicationKey,
      startedAt: new Date().toISOString(),
    });
    await checkpointer.saveSnapshot(runId, {
      runId,
      version: 1,
      data: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    const createOrClaim = vi.spyOn(checkpointer, "createOrClaimRunOwnership");
    const scheduler = new Scheduler({
      eventBus,
      checkpointer,
      executorPool: new QueuedExecutorPool({ maxConcurrency: 1 }),
      graphRegistry,
      nodeRegistry,
    });

    await expect(
      scheduler.start(graph.id, {}, { deduplicationKey }),
    ).resolves.toBe(runId);
    expect(createOrClaim).toHaveBeenCalledTimes(1);
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
