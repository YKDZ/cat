import { describe, expect, it, vi } from "vitest";

import type { NodeExecutor } from "@/graph/node-registry";

import { MemoryCheckpointer } from "@/graph/checkpointer";
import { QueuedExecutorPool } from "@/graph/executor-pool";

const createDeferred = <T>() => {
  let resolvePromise: ((value: T) => void) | null = null;
  const promise = new Promise<T>((resolve) => {
    resolvePromise = resolve;
  });
  return {
    promise,
    resolve: (value: T) => {
      resolvePromise?.(value);
    },
  };
};

const createTask = (args: { nodeId: string; executor: NodeExecutor }) => {
  return {
    runId: "11111111-1111-4111-8111-111111111111",
    nodeId: args.nodeId,
    nodeDef: {
      id: args.nodeId,
      type: "transform" as const,
      timeoutMs: 5_000,
    },
    snapshot: {
      runId: "11111111-1111-4111-8111-111111111111",
      version: 0,
      data: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    checkpointer: new MemoryCheckpointer(),
    executor: args.executor,
    config: {},
    runtime: {},
    emitProxy: async () => undefined,
    publishToStream: async () => undefined,
  };
};

describe("QueuedExecutorPool", () => {
  it("queues tasks and enforces max concurrency", async () => {
    const pool = new QueuedExecutorPool({ maxConcurrency: 1 });
    const firstGate = createDeferred<void>();
    const secondGate = createDeferred<void>();
    const order: string[] = [];
    let activeCount = 0;
    let maxActiveCount = 0;

    const createExecutor = (
      label: string,
      gate: ReturnType<typeof createDeferred<void>>,
    ): NodeExecutor => {
      return async () => {
        order.push(`${label}:start`);
        activeCount += 1;
        maxActiveCount = Math.max(maxActiveCount, activeCount);
        await gate.promise;
        activeCount -= 1;
        order.push(`${label}:end`);
        return {
          status: "completed",
        };
      };
    };

    const firstPromise = pool.submit(
      createTask({
        nodeId: "first",
        executor: createExecutor("first", firstGate),
      }),
    );
    const secondPromise = pool.submit(
      createTask({
        nodeId: "second",
        executor: createExecutor("second", secondGate),
      }),
    );

    await vi.waitFor(() => {
      expect(order).toEqual(["first:start"]);
    });

    firstGate.resolve();

    await vi.waitFor(() => {
      expect(order).toEqual(["first:start", "first:end", "second:start"]);
    });

    secondGate.resolve();
    await Promise.all([firstPromise, secondPromise]);

    expect(order).toEqual([
      "first:start",
      "first:end",
      "second:start",
      "second:end",
    ]);
    expect(maxActiveCount).toBe(1);
  });

  it("waits for active work during shutdown", async () => {
    const pool = new QueuedExecutorPool({ maxConcurrency: 1 });
    const gate = createDeferred<void>();

    const submitPromise = pool.submit(
      createTask({
        nodeId: "slow",
        executor: async () => {
          await gate.promise;
          return { status: "completed" };
        },
      }),
    );

    const shutdownPromise = pool.shutdown();
    let shutdownFinished = false;
    void shutdownPromise.then(() => {
      shutdownFinished = true;
    });

    await vi.waitFor(() => {
      expect(shutdownFinished).toBe(false);
    });

    gate.resolve();
    await Promise.all([submitPromise, shutdownPromise]);

    expect(shutdownFinished).toBe(true);
  });
});
