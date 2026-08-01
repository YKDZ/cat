/**
 * Global graph runtime storage.
 *
 * A minimal singleton that holds references to the core graph infrastructure
 * (scheduler, eventBus, checkpointer). Kept in its own file to avoid circular
 * dependencies between `graph/index.ts` and `graph/dsl/run-graph.ts`.
 */

import type { Checkpointer } from "#/graph/checkpointer/index.ts";
import type { AgentEventBus } from "#/graph/event-bus.ts";
import type { QueuedExecutorPool } from "#/graph/executor-pool.ts";
import type { GraphRegistry } from "#/graph/graph-registry.ts";
import type { NodeRegistry } from "#/graph/node-registry.ts";
import type { Scheduler } from "#/graph/scheduler.ts";
import type {
  LocalizationTaskService,
  WorkflowTaskProjector,
} from "#/workflow/tasks/index.ts";

export type StoredGraphRuntime = {
  scheduler: Scheduler;
  eventBus: AgentEventBus;
  checkpointer: Checkpointer;
  executorPool: QueuedExecutorPool;
  graphRegistry: GraphRegistry;
  nodeRegistry: NodeRegistry;
  taskProjector: WorkflowTaskProjector;
  taskService: LocalizationTaskService;
  ensureTaskRecovery: () => Promise<void>;
  dispose: () => Promise<void>;
};

let storedRuntime: StoredGraphRuntime | null = null;
const runtimeBridgeKey = "__CAT_GRAPH_RUNTIME__";

const isStoredGraphRuntime = (value: unknown): value is StoredGraphRuntime =>
  typeof value === "object" &&
  value !== null &&
  typeof Reflect.get(value, "scheduler") === "object" &&
  Reflect.get(value, "scheduler") !== null &&
  typeof Reflect.get(Reflect.get(value, "scheduler"), "start") === "function" &&
  typeof Reflect.get(Reflect.get(value, "scheduler"), "getActiveRunIds") ===
    "function" &&
  typeof Reflect.get(value, "ensureTaskRecovery") === "function";

const bridgedRuntime = (): StoredGraphRuntime | null => {
  const runtime: unknown = Reflect.get(process, runtimeBridgeKey);
  return isStoredGraphRuntime(runtime) ? runtime : null;
};

export const storeGraphRuntime = (runtime: StoredGraphRuntime): void => {
  storedRuntime = runtime;
  Reflect.set(process, runtimeBridgeKey, runtime);
};

export const getStoredGraphRuntime = (): StoredGraphRuntime => {
  const runtime = storedRuntime ?? bridgedRuntime();
  if (!runtime) {
    throw new Error(
      "Global graph runtime not initialized. Call storeGraphRuntime first.",
    );
  }
  return runtime;
};

/**
 * Get the global graph runtime, or return `null` when it has not been initialized yet.
 *
 * @returns - Stored runtime or `null`
 */
export const getStoredGraphRuntimeOrNull = (): StoredGraphRuntime | null => {
  return storedRuntime ?? bridgedRuntime();
};
