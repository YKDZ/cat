import type { JSONObject } from "@cat/shared";
import { OperationFailureInputSchema } from "@cat/shared";

import type { Checkpointer } from "#/graph/checkpointer/index.ts";
import type { EventEnvelopeInput } from "#/graph/events.ts";
import type { LeaseManager } from "#/graph/lease.ts";
import { InProcessLeaseManager } from "#/graph/lease.ts";
import type { NodeExecutor } from "#/graph/node-registry.ts";
import type {
  GraphRuntimeContext,
  NodeDefinition,
  RetryConfig,
  RunId,
} from "#/graph/types.ts";
import {
  defaultWorkflowLogger,
  type WorkflowLogger,
} from "#/graph/workflow-logger.ts";

export type ExecutorTask = {
  runId: RunId;
  nodeId: string;
  nodeDef: NodeDefinition;
  snapshot: {
    runId: string;
    version: number;
    data: JSONObject;
    createdAt: string;
    updatedAt: string;
  };
  checkpointer: Checkpointer;
  executor: NodeExecutor;
  config: Record<string, unknown>;
  runtime: GraphRuntimeContext;
  emitProxy: (event: EventEnvelopeInput) => Promise<void>;
  publishToStream: (events: EventEnvelopeInput[]) => Promise<void>;
  signal?: AbortSignal | undefined;
  idempotencyKey?: string | undefined;
  retry?: RetryConfig | undefined;
};

export type ExecutorPool = {
  submit: (task: ExecutorTask) => Promise<void>;
  shutdown?: () => Promise<void>;
};

const sleep = async (ms: number, signal?: AbortSignal): Promise<void> => {
  if (signal?.aborted) return;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const elapsed = new Promise<void>((resolve) => {
    timeout = setTimeout(resolve, ms);
  });
  if (!signal) {
    await elapsed;
    return;
  }
  let handleAbort: (() => void) | undefined;
  const aborted = new Promise<void>((resolve) => {
    handleAbort = resolve;
    signal.addEventListener("abort", handleAbort, { once: true });
  });
  await Promise.race([elapsed, aborted]);
  if (timeout) clearTimeout(timeout);
  if (handleAbort) signal.removeEventListener("abort", handleAbort);
};

const defaultRetry = {
  maxAttempts: 1,
  backoffMs: 1000,
  backoffMultiplier: 2,
};

const toAbortSignal = (signals: AbortSignal[]): AbortSignal | undefined => {
  if (signals.length === 0) return undefined;
  if (signals.length === 1) return signals[0];
  return AbortSignal.any(signals);
};

const buildNodeEndEvent = (
  result: Awaited<ReturnType<NodeExecutor>>,
): EventEnvelopeInput => {
  return {
    type: "node:end",
    payload: {
      status: result.status,
      output: result.output ?? null,
      patch: result.patch ?? null,
      pauseReason: result.pauseReason ?? null,
    },
  };
};

type QueueItem = {
  task: ExecutorTask;
  resolve: () => void;
  reject: (error: unknown) => void;
};

type QueuedExecutorPoolOptions = {
  maxConcurrency?: number;
  leaseManager?: LeaseManager;
  logger?: WorkflowLogger;
};

export class QueuedExecutorPool implements ExecutorPool {
  private readonly queue: QueueItem[] = [];

  private activeCount = 0;

  private shuttingDown = false;

  readonly maxConcurrency: number;

  readonly leaseManager: LeaseManager;

  readonly logger: WorkflowLogger;

  constructor(options?: QueuedExecutorPoolOptions) {
    this.maxConcurrency = options?.maxConcurrency ?? 10;
    this.leaseManager = options?.leaseManager ?? new InProcessLeaseManager();
    this.logger = options?.logger ?? defaultWorkflowLogger;
  }

  submit = async (task: ExecutorTask): Promise<void> => {
    if (this.shuttingDown) {
      throw new Error("QueuedExecutorPool is shutting down");
    }

    return new Promise<void>((resolve, reject) => {
      this.queue.push({ task, resolve, reject });
      this.logger.executorPool("task:queued", {
        runId: task.runId,
        nodeId: task.nodeId,
        queueSize: this.queue.length,
        activeCount: this.activeCount,
      });
      this.tryDrain();
    });
  };

  shutdown = async (): Promise<void> => {
    this.shuttingDown = true;
    const shutdownError = new Error("QueuedExecutorPool is shutting down");
    for (const item of this.queue.splice(0)) {
      item.reject(shutdownError);
    }
    await new Promise<void>((resolve) => {
      const poll = (): void => {
        if (this.activeCount === 0) {
          resolve();
          return;
        }
        setTimeout(poll, 10);
      };
      poll();
    });
  };

  private tryDrain = (): void => {
    while (
      !this.shuttingDown &&
      this.activeCount < this.maxConcurrency &&
      this.queue.length > 0
    ) {
      const next = this.queue.shift();
      if (!next) return;
      this.activeCount += 1;
      void this.executeQueuedItem(next).finally(() => {
        this.activeCount -= 1;
        this.tryDrain();
      });
    }
  };

  private executeQueuedItem = async (item: QueueItem): Promise<void> => {
    try {
      await this.executeWithRetry(item.task);
      item.resolve();
    } catch (error) {
      item.reject(error);
    }
  };

  private executeWithRetry = async (task: ExecutorTask): Promise<void> => {
    const retry = task.retry ?? {
      ...defaultRetry,
    };

    let attempt = 0;
    let lastError: unknown;

    while (attempt < retry.maxAttempts) {
      if (task.signal?.aborted) return;
      const leaseDurationMs = task.nodeDef.timeoutMs ?? 120_000;
      // oxlint-disable-next-line no-await-in-loop
      const lease = await this.leaseManager.acquire(
        task.runId,
        task.nodeId,
        leaseDurationMs,
      );

      if (!lease) {
        return;
      }

      const abortController = new AbortController();
      const timeoutSignal = AbortSignal.timeout(leaseDurationMs);
      const signal = toAbortSignal(
        [
          abortController.signal,
          timeoutSignal,
          ...(task.signal ? [task.signal] : []),
        ].filter((item): item is AbortSignal => item !== undefined),
      );
      const bufferedEvents: EventEnvelopeInput[] = [];
      const renewLease = async (): Promise<boolean> => {
        return this.leaseManager.renew(task.runId, task.nodeId, lease.leaseId);
      };
      const heartbeatTimer = setInterval(() => {
        void renewLease().then(async (renewed) => {
          if (renewed) return undefined;
          abortController.abort(new Error("Node lease expired"));
          await task.emitProxy({
            type: "node:lease:expired",
            payload: { leaseId: lease.leaseId },
          });
          return undefined;
        });
      }, lease.heartbeatIntervalMs);

      try {
        // oxlint-disable-next-line no-await-in-loop
        await task.emitProxy({
          type: "node:lease:acquired",
          payload: {
            leaseId: lease.leaseId,
            expiresAt: lease.expiresAt,
            heartbeatIntervalMs: lease.heartbeatIntervalMs,
          },
        });

        // oxlint-disable-next-line no-await-in-loop
        const result = await task.executor(
          {
            runId: task.runId,
            nodeId: task.nodeId,
            snapshot: task.snapshot,
            signal,
            idempotencyKey: task.idempotencyKey,
            checkpointer: task.checkpointer,
            runtime: task.runtime,
            emit: async (event) => {
              await renewLease();
              await task.emitProxy(event);
            },
            addEvent: (event) => {
              bufferedEvents.push(event);
            },
          },
          task.config,
        );

        signal?.throwIfAborted();

        // Publication is the commit point. Fence it with a final lease check so
        // an executor that lost ownership cannot publish stale output.
        // oxlint-disable-next-line no-await-in-loop
        if (!(await renewLease())) {
          throw new Error("Node lease expired before output publication");
        }

        // oxlint-disable-next-line no-await-in-loop
        await task.publishToStream([
          buildNodeEndEvent(result),
          ...bufferedEvents,
          ...(result.events ?? []),
        ]);

        // oxlint-disable-next-line no-await-in-loop
        await this.leaseManager.release(task.runId, task.nodeId, lease.leaseId);

        clearInterval(heartbeatTimer);

        return;
      } catch (error) {
        clearInterval(heartbeatTimer);
        lastError = error;
        attempt += 1;
        // oxlint-disable-next-line no-await-in-loop
        await this.leaseManager.release(task.runId, task.nodeId, lease.leaseId);

        if (task.signal?.aborted) return;

        if (attempt < retry.maxAttempts) {
          // oxlint-disable-next-line no-await-in-loop
          await task.emitProxy({
            type: "node:retry",
            payload: {
              attempt,
              maxAttempts: retry.maxAttempts,
              error: error instanceof Error ? error.message : String(error),
            },
          });

          const delay = Math.floor(
            retry.backoffMs * retry.backoffMultiplier ** (attempt - 1),
          );
          // oxlint-disable-next-line no-await-in-loop
          await sleep(delay, task.signal);
          if (task.signal?.aborted) return;
          continue;
        }
      }
    }

    const operationFailure = OperationFailureInputSchema.safeParse(
      typeof lastError === "object" && lastError !== null
        ? Reflect.get(lastError, "operationFailure")
        : undefined,
    );
    await task.emitProxy({
      type: "node:error",
      payload: {
        error:
          lastError instanceof Error ? lastError.message : String(lastError),
        ...(operationFailure.success
          ? { operationFailure: operationFailure.data }
          : {}),
      },
    });
  };
}

export class LocalExecutorPool extends QueuedExecutorPool {
  constructor() {
    super({ maxConcurrency: Number.POSITIVE_INFINITY });
  }
}
