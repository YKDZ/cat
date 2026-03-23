import type { DrizzleClient } from "@cat/domain";
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
import { storeGraphRuntime } from "@/graph/runtime-store";
import { Scheduler } from "@/graph/scheduler";
import { createRuntimeResolver, type RuntimeResolver } from "@/runtime";
import { termAlignmentGraph, termDiscoveryGraph } from "@/workflow/tasks";
import {
  autoTranslateGraph,
  batchAutoTranslateGraph,
  createElementGraph,
  createTermGraph,
  createTranslatableStringGraph,
  createTranslationGraph,
  diffElementsGraph,
  fetchAdviseGraph,
  nlpBatchSegmentGraph,
  nlpSegmentGraph,
  parseFileGraph,
  qaGraph,
  qaTranslationGraph,
  retriveEmbeddingsGraph,
  revectorizeConceptGraph,
  revectorizeGraph,
  revectorizeSubjectConceptsGraph,
  searchChunkGraph,
  searchMemoryGraph,
  spotTermGraph,
  tokenizeGraph,
  upsertDocumentGraph,
  vectorizeGraph,
} from "@/workflow/tasks";

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
export * from "@/graph/typed-dsl";
export * from "@/graph/distributed-extensions";
export { getStoredGraphRuntime as getGlobalGraphRuntime } from "@/graph/runtime-store";

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
  graphRegistry.register(termDiscoveryGraph.graphDefinition);
  graphRegistry.register(termAlignmentGraph.graphDefinition);
  graphRegistry.register(autoTranslateGraph.graphDefinition);
  graphRegistry.register(batchAutoTranslateGraph.graphDefinition);
  graphRegistry.register(createElementGraph.graphDefinition);
  graphRegistry.register(createTermGraph.graphDefinition);
  graphRegistry.register(createTranslatableStringGraph.graphDefinition);
  graphRegistry.register(createTranslationGraph.graphDefinition);
  graphRegistry.register(diffElementsGraph.graphDefinition);
  graphRegistry.register(fetchAdviseGraph.graphDefinition);
  graphRegistry.register(nlpBatchSegmentGraph.graphDefinition);
  graphRegistry.register(nlpSegmentGraph.graphDefinition);
  graphRegistry.register(parseFileGraph.graphDefinition);
  graphRegistry.register(qaGraph.graphDefinition);
  graphRegistry.register(qaTranslationGraph.graphDefinition);
  graphRegistry.register(retriveEmbeddingsGraph.graphDefinition);
  graphRegistry.register(revectorizeConceptGraph.graphDefinition);
  graphRegistry.register(revectorizeGraph.graphDefinition);
  graphRegistry.register(revectorizeSubjectConceptsGraph.graphDefinition);
  graphRegistry.register(searchChunkGraph.graphDefinition);
  graphRegistry.register(searchMemoryGraph.graphDefinition);
  graphRegistry.register(spotTermGraph.graphDefinition);
  graphRegistry.register(tokenizeGraph.graphDefinition);
  graphRegistry.register(upsertDocumentGraph.graphDefinition);
  graphRegistry.register(vectorizeGraph.graphDefinition);

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

  const runtime: DefaultGraphRuntime = {
    eventBus,
    checkpointer,
    executorPool,
    graphRegistry,
    nodeRegistry,
    runtimeResolver,
    scheduler,
    baseScheduler,
  };

  storeGraphRuntime(runtime);

  return runtime;
};
