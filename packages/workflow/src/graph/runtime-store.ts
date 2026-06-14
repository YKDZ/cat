/**
 * Global graph runtime storage.
 *
 * A minimal singleton that holds references to the core graph infrastructure
 * (scheduler, eventBus, checkpointer). Kept in its own file to avoid circular
 * dependencies between `graph/index.ts` and `graph/dsl/run-graph.ts`.
 */

import type { Checkpointer } from "@/graph/checkpointer";
import type { AgentEventBus } from "@/graph/event-bus";
import type { Scheduler } from "@/graph/scheduler";

export type StoredGraphRuntime = {
  scheduler: Pick<Scheduler, "start" | "getActiveRunIds">;
  eventBus: AgentEventBus;
  checkpointer: Checkpointer;
};

let storedRuntime: StoredGraphRuntime | null = null;

export const storeGraphRuntime = (runtime: StoredGraphRuntime): void => {
  storedRuntime = runtime;
};

export const getStoredGraphRuntime = (): StoredGraphRuntime => {
  if (!storedRuntime) {
    throw new Error(
      "Global graph runtime not initialized. Call storeGraphRuntime first.",
    );
  }
  return storedRuntime;
};

/**
 * Get the global graph runtime, or return `null` when it has not been initialized yet.
 *
 * @returns - Stored runtime or `null`
 */
export const getStoredGraphRuntimeOrNull = (): StoredGraphRuntime | null => {
  return storedRuntime;
};
