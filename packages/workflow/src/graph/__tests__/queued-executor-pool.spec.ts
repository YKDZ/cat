import { describe, expect, it, vi } from "vitest";

import { MemoryCheckpointer } from "#/graph/checkpointer/index.ts";
import { QueuedExecutorPool } from "#/graph/executor-pool.ts";
import type { LeaseManager } from "#/graph/lease.ts";
import type { NodeExecutor } from "#/graph/node-registry.ts";

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

const createTask = (args: {
  nodeId: string;
  executor: NodeExecutor;
  signal?: AbortSignal;
  timeoutMs?: number;
  retry?: { maxAttempts: number; backoffMs: number; backoffMultiplier: number };
  publishToStream?: () => Promise<void>;
  emitProxy?: (event: { type: string }) => Promise<void>;
}) => {
  return {
    runId: "11111111-1111-4111-8111-111111111111",
    nodeId: args.nodeId,
    nodeDef: {
      id: args.nodeId,
      type: "transform" as const,
      timeoutMs: args.timeoutMs ?? 5_000,
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
    emitProxy: args.emitProxy ?? (async () => undefined),
    publishToStream: args.publishToStream ?? (async () => undefined),
    signal: args.signal,
    retry: args.retry,
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
      return undefined;
    });

    await vi.waitFor(() => {
      expect(shutdownFinished).toBe(false);
    });

    gate.resolve();
    await Promise.all([submitPromise, shutdownPromise]);

    expect(shutdownFinished).toBe(true);
  });

  it("settles queued work when shutdown starts", async () => {
    const pool = new QueuedExecutorPool({ maxConcurrency: 1 });
    const gate = createDeferred<void>();
    const active = pool.submit(
      createTask({
        nodeId: "active",
        executor: async () => {
          await gate.promise;
          return { status: "completed" };
        },
      }),
    );
    const queued = pool.submit(
      createTask({
        nodeId: "queued",
        executor: async () => ({ status: "completed" }),
      }),
    );

    const shutdown = pool.shutdown();
    await expect(queued).rejects.toThrow("shutting down");
    gate.resolve();
    await Promise.all([active, shutdown]);
  });

  it("does not publish after the combined timeout signal aborts", async () => {
    const publishToStream = vi.fn(async () => undefined);
    const pool = new QueuedExecutorPool({ maxConcurrency: 1 });

    await pool.submit(
      createTask({
        nodeId: "timed-out",
        timeoutMs: 10,
        executor: async () => {
          await new Promise((resolve) => setTimeout(resolve, 20));
          return { status: "completed" };
        },
        publishToStream,
      }),
    );

    expect(publishToStream).not.toHaveBeenCalled();
  });

  it("fences publication when the lease can no longer be renewed", async () => {
    const publishToStream = vi.fn(async () => undefined);
    const leaseManager: LeaseManager = {
      acquire: vi.fn(async () => ({
        runId: "11111111-1111-4111-8111-111111111111",
        nodeId: "lease-lost",
        leaseId: "lease-1",
        acquiredAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 5_000).toISOString(),
        lastHeartbeatAt: new Date().toISOString(),
        heartbeatIntervalMs: 1_000,
        status: "active" as const,
      })),
      renew: vi.fn(async () => false),
      release: vi.fn(async () => undefined),
      findExpired: vi.fn(async () => []),
    };
    const pool = new QueuedExecutorPool({ maxConcurrency: 1, leaseManager });

    await pool.submit(
      createTask({
        nodeId: "lease-lost",
        executor: async () => ({ status: "completed" }),
        publishToStream,
      }),
    );

    expect(publishToStream).not.toHaveBeenCalled();
  });

  it("aborts retry backoff without running another attempt", async () => {
    const controller = new AbortController();
    const retries = createDeferred<void>();
    const emitProxy = vi.fn(async (event: { type: string }) => {
      if (event.type === "node:retry") retries.resolve();
    });
    const executor = vi.fn(async () => {
      throw new Error("retry me");
    });
    const pool = new QueuedExecutorPool({ maxConcurrency: 1 });
    const submitted = pool.submit(
      createTask({
        nodeId: "retry-abort",
        executor,
        signal: controller.signal,
        retry: { maxAttempts: 3, backoffMs: 10_000, backoffMultiplier: 1 },
        emitProxy,
      }),
    );

    await retries.promise;
    controller.abort();
    await submitted;

    expect(executor).toHaveBeenCalledTimes(1);
  });

  it("preserves a typed operation failure after retry exhaustion", async () => {
    const operationFailure = {
      code: "CAT_OPERATION_DEPENDENCY_UNAVAILABLE" as const,
      message: "Language analysis is unavailable.",
      severity: "ERROR" as const,
      retryable: true,
      capability: "LANGUAGE_ANALYSIS" as const,
      affectedResources: [{ type: "ELEMENT" as const, id: "42" }],
      redactionBoundary: "PUBLIC" as const,
    };
    const error = Object.assign(new Error(operationFailure.message), {
      operationFailure,
    });
    const emitProxy = vi.fn(async () => undefined);
    const pool = new QueuedExecutorPool({ maxConcurrency: 1 });

    await pool.submit(
      createTask({
        nodeId: "typed-failure",
        executor: async () => {
          throw error;
        },
        retry: { maxAttempts: 1, backoffMs: 0, backoffMultiplier: 1 },
        emitProxy,
      }),
    );

    expect(emitProxy).toHaveBeenCalledWith({
      type: "node:error",
      payload: {
        error: operationFailure.message,
        operationFailure,
      },
    });
  });
});
