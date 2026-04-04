import { describe, expect, it } from "vitest";

import type { GraphDefinition } from "@/graph/types";

import { MemoryCheckpointer } from "@/graph/checkpointer";
import { InProcessEventBus } from "@/graph/event-bus";
import { QueuedExecutorPool } from "@/graph/executor-pool";
import { GraphRegistry } from "@/graph/graph-registry";
import { NodeRegistry } from "@/graph/node-registry";
import { Scheduler } from "@/graph/scheduler";

describe("workflow event stream ordering", () => {
  it("publishes stream events before node:end and discrete events after node:end", async () => {
    const eventBus = new InProcessEventBus();
    const checkpointer = new MemoryCheckpointer();
    const executorPool = new QueuedExecutorPool({ maxConcurrency: 1 });
    const graphRegistry = new GraphRegistry();
    const nodeRegistry = new NodeRegistry();

    nodeRegistry.register("transform", async (ctx) => {
      await ctx.emit({
        type: "checkpoint:saved",
        payload: {},
      });
      ctx.addEvent({
        type: "workflow:qa:issue",
        payload: { traceId: "qa-1", result: [] },
      });
      return {
        status: "completed",
        events: [
          {
            type: "workflow:suggestion:ready",
            payload: {
              elementId: 1,
              suggestion: {},
            },
          },
        ],
      };
    });

    const graph: GraphDefinition = {
      id: "event-order-graph",
      version: "1.0.0",
      entry: "node-1",
      nodes: {
        "node-1": {
          id: "node-1",
          type: "transform",
          timeoutMs: 1_000,
        },
      },
      edges: [],
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

    const seenTypes: string[] = [];
    eventBus.subscribeAll((event) => {
      seenTypes.push(event.type);
    });

    const runId = await scheduler.start(graph.id, {});
    await eventBus.waitFor({
      type: "run:end",
      timeoutMs: 2_000,
      predicate: (event) => event.runId === runId,
    });

    expect(seenTypes).toEqual([
      "run:start",
      "node:start",
      "node:lease:acquired",
      "checkpoint:saved",
      "node:end",
      "workflow:qa:issue",
      "workflow:suggestion:ready",
      "run:end",
    ]);

    await scheduler.dispose();
  });
});
