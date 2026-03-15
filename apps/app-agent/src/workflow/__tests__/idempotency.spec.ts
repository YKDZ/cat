import { afterEach, describe, expect, it } from "vitest";
import * as z from "zod/v4";

import { MemoryCheckpointer } from "@/graph/checkpointer";
import { InProcessEventBus } from "@/graph/event-bus";
import { QueuedExecutorPool } from "@/graph/executor-pool";
import { GraphRegistry } from "@/graph/graph-registry";
import { NodeRegistry } from "@/graph/node-registry";
import { Scheduler } from "@/graph/scheduler";
import { defineGraphTask } from "@/workflow/define-task";
import { TaskRegistry } from "@/workflow/task-registry";

afterEach(() => {
  TaskRegistry.reset();
});

describe("workflow idempotency", () => {
  it("recordSideEffect returns cached payload on retry with same runId and traceId", async () => {
    TaskRegistry.init();
    let writes = 0;

    const task = defineGraphTask({
      name: "idempotent.write",
      input: z.object({ key: z.string() }),
      output: z.object({ value: z.number() }),
      handler: async (payload, ctx) => {
        const existing = await ctx.checkSideEffect<number>(payload.key);
        if (existing !== null) {
          return { value: existing };
        }

        writes += 1;
        await ctx.recordSideEffect(payload.key, "db_write", writes);
        return { value: writes };
      },
    });

    const runId = "11111111-1111-4111-8111-111111111111";
    const traceId = "trace-1";

    const first = await task.run({ key: "item-1" }, { runId, traceId });
    const second = await task.run({ key: "item-1" }, { runId, traceId });

    expect(await first.result()).toEqual({ value: 1 });
    expect(await second.result()).toEqual({ value: 1 });
    expect(writes).toBe(1);
  });

  it("reuses the same run when scheduler.start gets the same deduplicationKey", async () => {
    const eventBus = new InProcessEventBus();
    const checkpointer = new MemoryCheckpointer();
    const executorPool = new QueuedExecutorPool({ maxConcurrency: 1 });
    const graphRegistry = new GraphRegistry();
    const nodeRegistry = new NodeRegistry();

    nodeRegistry.register("transform", async () => ({ status: "completed" }));
    graphRegistry.register({
      id: "dedup-graph",
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
    });

    const scheduler = new Scheduler({
      eventBus,
      checkpointer,
      executorPool,
      graphRegistry,
      nodeRegistry,
      reclaimIntervalMs: 1_000,
    });

    const firstRunId = await scheduler.start(
      "dedup-graph",
      {},
      {
        deduplicationKey: "same-key",
      },
    );
    const secondRunId = await scheduler.start(
      "dedup-graph",
      {},
      {
        deduplicationKey: "same-key",
      },
    );

    expect(secondRunId).toBe(firstRunId);

    await eventBus.waitFor({
      type: "run:end",
      timeoutMs: 2_000,
      predicate: (event) => event.runId === firstRunId,
    });

    await scheduler.dispose();
  });
});
