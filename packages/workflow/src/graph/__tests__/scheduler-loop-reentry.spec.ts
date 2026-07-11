import { describe, expect, it } from "vitest";

import { buildPatch } from "#/graph/blackboard.ts";
import { MemoryCheckpointer } from "#/graph/checkpointer/index.ts";
import { InProcessEventBus } from "#/graph/event-bus.ts";
import { QueuedExecutorPool } from "#/graph/executor-pool.ts";
import { GraphRegistry } from "#/graph/graph-registry.ts";
import { NodeRegistry } from "#/graph/node-registry.ts";
import { Scheduler } from "#/graph/scheduler.ts";
import type { GraphDefinition } from "#/graph/types.ts";

describe("Scheduler loop re-entry", () => {
  it("allows a completed node to be scheduled again in a loop graph", async () => {
    const eventBus = new InProcessEventBus();
    const checkpointer = new MemoryCheckpointer();
    const executorPool = new QueuedExecutorPool({ maxConcurrency: 1 });
    const graphRegistry = new GraphRegistry();
    const nodeRegistry = new NodeRegistry();

    nodeRegistry.register("transform", async (ctx) => {
      if (ctx.nodeId === "think") {
        const snapshotData = ctx.snapshot.data;
        const iterationsRaw = Reflect.get(snapshotData, "iterations");
        const iterations =
          typeof iterationsRaw === "number" ? iterationsRaw : 0;
        const nextIterations = iterations + 1;
        const nextNode = nextIterations < 2 ? "act" : "finish";

        return {
          status: "completed",
          patch: buildPatch({
            actorId: ctx.nodeId,
            parentSnapshotVersion: ctx.snapshot.version,
            updates: {
              iterations: nextIterations,
              __nextNode: nextNode,
            },
          }),
        };
      }

      if (ctx.nodeId === "act") {
        return {
          status: "completed",
          patch: buildPatch({
            actorId: ctx.nodeId,
            parentSnapshotVersion: ctx.snapshot.version,
            updates: {
              acted: true,
            },
          }),
        };
      }

      return {
        status: "completed",
      };
    });

    const graph: GraphDefinition = {
      id: "loop-reentry-graph",
      version: "1.0.0",
      entry: "think",
      nodes: {
        think: { id: "think", type: "transform", timeoutMs: 1_000 },
        act: { id: "act", type: "transform", timeoutMs: 1_000 },
        finish: { id: "finish", type: "transform", timeoutMs: 1_000 },
      },
      edges: [
        {
          from: "think",
          to: "act",
          condition: {
            field: "__nextNode",
            operator: "eq",
            value: "act",
          },
        },
        {
          from: "think",
          to: "finish",
          condition: {
            field: "__nextNode",
            operator: "eq",
            value: "finish",
          },
        },
        {
          from: "act",
          to: "think",
        },
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

    const runId = await scheduler.start(graph.id, {});
    const runEndEvent = await eventBus.waitFor({
      type: "run:end",
      timeoutMs: 2_000,
      predicate: (event) => event.runId === runId,
    });

    expect(runEndEvent.payload).toMatchObject({
      status: "completed",
      blackboard: {
        iterations: 2,
        acted: true,
        __nextNode: "finish",
      },
    });

    await scheduler.dispose();
  });
});
