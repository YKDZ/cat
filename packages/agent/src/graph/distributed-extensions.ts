import type { Checkpointer } from "./checkpointer";
import type { EventBus } from "./event-bus";
import type { AgentEvent, EventHandler, EventType } from "./events";
import type { ExecutorPool, ExecutorTask } from "./executor-pool";
import type { RunId } from "./types";

/**
 * 分布式扩展点
 *
 * 当前实现为单机版本：
 * - EventBus: InProcessEventBus
 * - Checkpointer: Memory/Postgres（后续）
 * - ExecutorPool: LocalExecutorPool
 * - Scheduler: Single process
 */

export type WorkerStatus = {
  workerId: string;
  status: "idle" | "busy" | "offline";
  runningTasks: number;
};

export interface DistributedEventBus extends EventBus {
  publishRemote: (event: AgentEvent) => Promise<void>;
  subscribeRemote: (
    eventType: EventType,
    handler: EventHandler,
  ) => Promise<void>;
}

export interface DistributedCheckpointer extends Checkpointer {
  acquireLock: (runId: RunId, timeoutMs: number) => Promise<boolean>;
  releaseLock: (runId: RunId) => Promise<void>;
}

export interface DistributedExecutorPool extends ExecutorPool {
  submitRemote: (task: ExecutorTask) => Promise<void>;
  getWorkerStatus: () => Promise<WorkerStatus[]>;
}
