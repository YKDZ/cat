import type { DrizzleClient } from "@cat/db";
import type { PluginManager } from "@cat/plugin-core";

import { PostgresCheckpointer } from "@/graph/checkpointer";
import { InMemoryCompensationRegistry } from "@/graph/compensation";
import { InProcessEventBus } from "@/graph/event-bus";
import { LocalExecutorPool, QueuedExecutorPool } from "@/graph/executor-pool";
import {
  HumanInputNodeExecutor,
  JoinNodeExecutor,
  LLMNodeExecutor,
  LoopNodeExecutor,
  ParallelNodeExecutor,
  RouterNodeExecutor,
  SubgraphNodeExecutor,
  ToolNodeExecutor,
  TransformNodeExecutor,
} from "@/graph/executors";
import { GraphRegistry } from "@/graph/graph-registry";
import { pipelineGraph, reactLoopGraph } from "@/graph/graphs";
import { InProcessLeaseManager } from "@/graph/lease";
import { NodeRegistry } from "@/graph/node-registry";
import { RuntimeAwareScheduler } from "@/graph/runtime-aware-scheduler";
import { Scheduler } from "@/graph/scheduler";
import { createRuntimeResolver, type RuntimeResolver } from "@/runtime";

export type { EventBus } from "@/graph/event-bus";
export type { ExecutorPool, ExecutorTask } from "@/graph/executor-pool";
export { InProcessEventBus } from "@/graph/event-bus";
export { LocalExecutorPool, QueuedExecutorPool } from "@/graph/executor-pool";
export { GraphRegistry } from "@/graph/graph-registry";
export { NodeRegistry } from "@/graph/node-registry";
export { RuntimeAwareScheduler } from "@/graph/runtime-aware-scheduler";
export { Scheduler, type SchedulerStartOptions } from "@/graph/scheduler";
export { ResumeHandler } from "@/graph/resume-handler";
export * from "@/graph/cache";
export * from "@/graph/compensation";
export * from "@/graph/lease";
export * from "@/graph/workflow-logger";
export * from "@/graph/types";
export * from "@/graph/events";
export * from "@/graph/blackboard";
export * from "@/graph/schema-registry";
export * from "@/graph/checkpointer";
export * from "@/graph/event-store";
export * from "@/graph/graphs";
export * from "@/graph/builtin";
export * from "@/graph/dsl";
export * from "@/graph/distributed-extensions";

export type DefaultGraphRuntime = {
  eventBus: InProcessEventBus;
  checkpointer: PostgresCheckpointer;
  executorPool: QueuedExecutorPool;
  graphRegistry: GraphRegistry;
  nodeRegistry: NodeRegistry;
  runtimeResolver: RuntimeResolver;
  scheduler: RuntimeAwareScheduler;
  baseScheduler: Scheduler;
};

export const createDefaultGraphRuntime = (
  drizzle: DrizzleClient,
  pluginManager: PluginManager,
): DefaultGraphRuntime => {
  const eventBus = new InProcessEventBus();
  const checkpointer = new PostgresCheckpointer(drizzle);
  const leaseManager = new InProcessLeaseManager();
  const compensationRegistry = new InMemoryCompensationRegistry();
  const executorPool = new QueuedExecutorPool({ leaseManager });
  const graphRegistry = new GraphRegistry();
  const nodeRegistry = new NodeRegistry();

  nodeRegistry.register("llm", LLMNodeExecutor);
  nodeRegistry.register("tool", ToolNodeExecutor);
  nodeRegistry.register("router", RouterNodeExecutor);
  nodeRegistry.register("human_input", HumanInputNodeExecutor);
  nodeRegistry.register("parallel", ParallelNodeExecutor);
  nodeRegistry.register("join", JoinNodeExecutor);
  nodeRegistry.register("loop", LoopNodeExecutor);
  nodeRegistry.register("transform", TransformNodeExecutor);
  nodeRegistry.register("subgraph", SubgraphNodeExecutor);

  graphRegistry.register(reactLoopGraph);
  graphRegistry.register(pipelineGraph);

  const baseScheduler = new Scheduler({
    eventBus,
    checkpointer,
    executorPool,
    graphRegistry,
    nodeRegistry,
    compensationRegistry,
    leaseManager,
  });
  const runtimeResolver = createRuntimeResolver({
    drizzle,
    pluginManager,
  });
  const scheduler = new RuntimeAwareScheduler(baseScheduler, runtimeResolver);

  return {
    eventBus,
    checkpointer,
    executorPool,
    graphRegistry,
    nodeRegistry,
    runtimeResolver,
    scheduler,
    baseScheduler,
  };
};
