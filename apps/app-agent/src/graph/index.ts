import { MemoryCheckpointer } from "@/graph/checkpointer";
import { InProcessEventBus } from "@/graph/event-bus";
import { LocalExecutorPool } from "@/graph/executor-pool";
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
import { NodeRegistry } from "@/graph/node-registry";
import { Scheduler } from "@/graph/scheduler";

export type { EventBus } from "@/graph/event-bus";
export type { ExecutorPool, ExecutorTask } from "@/graph/executor-pool";
export { InProcessEventBus } from "@/graph/event-bus";
export { LocalExecutorPool } from "@/graph/executor-pool";
export { GraphRegistry } from "@/graph/graph-registry";
export { NodeRegistry } from "@/graph/node-registry";
export { Scheduler } from "@/graph/scheduler";
export { ResumeHandler } from "@/graph/resume-handler";
export * from "@/graph/types";
export * from "@/graph/events";
export * from "@/graph/blackboard";
export * from "@/graph/schema-registry";
export * from "@/graph/schema-utils";
export * from "@/graph/checkpointer";
export * from "@/graph/event-store";
export * from "@/graph/graphs";
export * from "@/graph/builtin";
export * from "@/graph/dsl";
export * from "@/graph/distributed-extensions";

export type DefaultGraphRuntime = {
  eventBus: InProcessEventBus;
  checkpointer: MemoryCheckpointer;
  executorPool: LocalExecutorPool;
  graphRegistry: GraphRegistry;
  nodeRegistry: NodeRegistry;
  scheduler: Scheduler;
};

export const createDefaultGraphRuntime = (): DefaultGraphRuntime => {
  const eventBus = new InProcessEventBus();
  const checkpointer = new MemoryCheckpointer();
  const executorPool = new LocalExecutorPool();
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

  const scheduler = new Scheduler({
    eventBus,
    checkpointer,
    executorPool,
    graphRegistry,
    nodeRegistry,
  });

  return {
    eventBus,
    checkpointer,
    executorPool,
    graphRegistry,
    nodeRegistry,
    scheduler,
  };
};
