import { MemoryCacheStore } from "@/graph/cache";
import { MemoryCheckpointer } from "@/graph/checkpointer";
import { InMemoryCompensationRegistry } from "@/graph/compensation";
import { InProcessEventBus } from "@/graph/event-bus";
import { defaultWorkflowLogger } from "@/graph/workflow-logger";

import type { WorkflowRuntime } from "./types";

export const createWorkflowRuntime = (
  overrides?: Partial<WorkflowRuntime>,
): WorkflowRuntime => {
  return {
    checkpointer: overrides?.checkpointer ?? new MemoryCheckpointer(),
    cacheStore: overrides?.cacheStore ?? new MemoryCacheStore(),
    compensationRegistry:
      overrides?.compensationRegistry ?? new InMemoryCompensationRegistry(),
    eventBus: overrides?.eventBus ?? new InProcessEventBus(),
    logger: overrides?.logger ?? defaultWorkflowLogger,
  };
};

let globalWorkflowRuntime: WorkflowRuntime = createWorkflowRuntime();

export const configureWorkflowRuntime = (runtime: WorkflowRuntime): void => {
  globalWorkflowRuntime = runtime;
};

export const getWorkflowRuntime = (): WorkflowRuntime => {
  return globalWorkflowRuntime;
};

export const resetWorkflowRuntime = (): WorkflowRuntime => {
  globalWorkflowRuntime = createWorkflowRuntime();
  return globalWorkflowRuntime;
};
