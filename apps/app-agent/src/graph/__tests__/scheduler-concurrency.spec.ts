import { describe, expect, it, vi } from "vitest";

import type { AgentEvent } from "@/graph/events";
import type { GraphDefinition } from "@/graph/types";

import { MemoryCheckpointer } from "@/graph/checkpointer";
import { InProcessEventBus } from "@/graph/event-bus";
import { QueuedExecutorPool } from "@/graph/executor-pool";
import { GraphRegistry } from "@/graph/graph-registry";
import { NodeRegistry, type NodeExecutor } from "@/graph/node-registry";
import { Scheduler } from "@/graph/scheduler";

const createDeferred = () => {
  let resolvePromise: (() => void) | null = null;
  const promise = new Promise<void>((resolve) => {
    resolvePromise = resolve;
  });
  return {
    promise,
    resolve: () => {
      resolvePromise?.();
    },
  };
};

describe("Scheduler maxConcurrentNodes", () => {
  it("dispatches at most maxConcurrentNodes at the same time", async () => {
    const eventBus = new InProcessEventBus();
    const checkpointer = new MemoryCheckpointer();
    const executorPool = new QueuedExecutorPool({ maxConcurrency: 10 });
    const graphRegistry = new GraphRegistry();
    const nodeRegistry = new NodeRegistry();

    const gates = new Map([
      ["branch-a", createDeferred()],
      ["branch-b", createDeferred()],
      ["branch-c", createDeferred()],
    ]);

    const executor: NodeExecutor = async (ctx) => {
      if (ctx.nodeId === "entry") {
        return { status: "completed" };
      }

      const gate = gates.get(ctx.nodeId);
      await gate?.promise;
      return { status: "completed" };
    };

    nodeRegistry.register("transform", executor);

    const graph: GraphDefinition = {
      id: "concurrency-graph",
      version: "1.0.0",
      entry: "entry",
      config: {
        maxConcurrentNodes: 2,
        defaultTimeoutMs: 5_000,
        enableCheckpoints: true,
        checkpointIntervalMs: 100,
      },
      nodes: {
        entry: { id: "entry", type: "transform", timeoutMs: 5_000 },
        "branch-a": { id: "branch-a", type: "transform", timeoutMs: 5_000 },
        "branch-b": { id: "branch-b", type: "transform", timeoutMs: 5_000 },
        "branch-c": { id: "branch-c", type: "transform", timeoutMs: 5_000 },
      },
      edges: [
        { from: "entry", to: "branch-a" },
        { from: "entry", to: "branch-b" },
        { from: "entry", to: "branch-c" },
      ],
    };

    graphRegistry.register(graph);

    const scheduler = new Scheduler({
      eventBus,
      checkpointer,
      executorPool,
      graphRegistry,
      nodeRegistry,
      reclaimIntervalMs: 1_000,
    });

    const startedBranches: string[] = [];
    eventBus.subscribe(
      "node:start",
      (event: Extract<AgentEvent, { type: "node:start" }>) => {
        if (event.nodeId && event.nodeId !== "entry") {
          startedBranches.push(event.nodeId);
        }
      },
    );

    const runId = await scheduler.start(graph.id, {});

    await vi.waitFor(() => {
      expect(startedBranches).toHaveLength(2);
    });

    expect(new Set(startedBranches)).toEqual(new Set(["branch-a", "branch-b"]));

    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(startedBranches).toHaveLength(2);

    gates.get("branch-a")?.resolve();

    await vi.waitFor(() => {
      expect(startedBranches).toContain("branch-c");
    });

    gates.get("branch-b")?.resolve();
    gates.get("branch-c")?.resolve();

    await eventBus.waitFor({
      type: "run:end",
      timeoutMs: 2_000,
      predicate: (event) => event.runId === runId,
    });

    await scheduler.dispose();
  });
});
