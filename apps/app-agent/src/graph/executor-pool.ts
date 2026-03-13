import type { Checkpointer } from "@/graph/checkpointer";
import type { EventBus } from "@/graph/event-bus";
import type { NodeExecutor } from "@/graph/node-registry";
import type { NodeDefinition, RetryConfig, RunId } from "@/graph/types";

export type ExecutorTask = {
  runId: RunId;
  nodeId: string;
  nodeDef: NodeDefinition;
  snapshot: {
    runId: string;
    version: number;
    data: unknown;
    createdAt: string;
    updatedAt: string;
  };
  eventBus: EventBus;
  checkpointer: Checkpointer;
  executor: NodeExecutor;
  config: Record<string, unknown>;
  signal?: AbortSignal;
  idempotencyKey?: string;
  retry?: RetryConfig;
};

export type ExecutorPool = {
  submit: (task: ExecutorTask) => Promise<void>;
};

const sleep = async (ms: number): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, ms));
};

export class LocalExecutorPool implements ExecutorPool {
  submit = async (task: ExecutorTask): Promise<void> => {
    const retry = task.retry ?? {
      maxAttempts: 1,
      backoffMs: 1000,
      backoffMultiplier: 2,
    };

    let attempt = 0;
    let lastError: unknown;

    while (attempt < retry.maxAttempts) {
      try {
        // oxlint-disable-next-line no-await-in-loop
        const result = await task.executor(
          {
            runId: task.runId,
            nodeId: task.nodeId,
            snapshot: task.snapshot,
            signal: task.signal,
            idempotencyKey: task.idempotencyKey,
            eventBus: task.eventBus,
            checkpointer: task.checkpointer,
          },
          task.config,
        );

        // oxlint-disable-next-line no-await-in-loop
        await task.eventBus.publish({
          runId: task.runId,
          nodeId: task.nodeId,
          type: "node:end",
          timestamp: new Date().toISOString(),
          payload: {
            status: result.status,
            output: result.output ?? null,
            patch: result.patch ?? null,
            pauseReason: result.pauseReason ?? null,
          },
        });

        return;
      } catch (error) {
        lastError = error;
        attempt += 1;

        if (attempt < retry.maxAttempts) {
          // oxlint-disable-next-line no-await-in-loop
          await task.eventBus.publish({
            runId: task.runId,
            nodeId: task.nodeId,
            type: "node:retry",
            timestamp: new Date().toISOString(),
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
          await sleep(delay);
          continue;
        }
      }
    }

    await task.eventBus.publish({
      runId: task.runId,
      nodeId: task.nodeId,
      type: "node:error",
      timestamp: new Date().toISOString(),
      payload: {
        error:
          lastError instanceof Error ? lastError.message : String(lastError),
      },
    });
  };
}
