import { describe, expect, it } from "vitest";

import type { GraphDefinition } from "@/graph/types";

import { buildPatch } from "@/graph/blackboard";
import { MemoryCheckpointer } from "@/graph/checkpointer";
import { InProcessEventBus } from "@/graph/event-bus";
import { QueuedExecutorPool } from "@/graph/executor-pool";
import { GraphRegistry } from "@/graph/graph-registry";
import { NodeRegistry } from "@/graph/node-registry";
import { Scheduler } from "@/graph/scheduler";

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
            type: "blackboard_field",
            value: "__nextNode==act",
          },
        },
        {
          from: "think",
          to: "finish",
          condition: {
            type: "blackboard_field",
            value: "__nextNode==finish",
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
