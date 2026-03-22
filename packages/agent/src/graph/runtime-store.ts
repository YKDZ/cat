/**
 * Global graph runtime storage.
 *
 * A minimal singleton that holds references to the core graph infrastructure
 * (scheduler, eventBus, checkpointer). Kept in its own file to avoid circular
 * dependencies between `graph/index.ts` and `graph/typed-dsl/run-graph.ts`.
 */

import type { Checkpointer } from "@/graph/checkpointer";
import type { EventBus } from "@/graph/event-bus";
import type { RuntimeAwareScheduler } from "@/graph/runtime-aware-scheduler";

export type StoredGraphRuntime = {
  scheduler: Pick<RuntimeAwareScheduler, "start">;
  eventBus: EventBus;
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
