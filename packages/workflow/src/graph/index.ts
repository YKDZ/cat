import type { DrizzleClient } from "@cat/domain";
import type { PluginManager } from "@cat/plugin-core";

import { PostgresCheckpointer } from "@/graph/checkpointer";
import { InMemoryCompensationRegistry } from "@/graph/compensation";
import { InProcessEventBus } from "@/graph/event-bus";
import { QueuedExecutorPool } from "@/graph/executor-pool";
import {
  HumanInputNodeExecutor,
  JoinNodeExecutor,
  LoopNodeExecutor,
  ParallelNodeExecutor,
  RouterNodeExecutor,
  SubgraphNodeExecutor,
  TransformNodeExecutor,
} from "@/graph/executors";
import { GraphRegistry } from "@/graph/graph-registry";
import { InProcessLeaseManager } from "@/graph/lease";
import { NodeRegistry } from "@/graph/node-registry";
import { storeGraphRuntime } from "@/graph/runtime-store";
import { Scheduler } from "@/graph/scheduler";
import { termAlignmentGraph, termDiscoveryGraph } from "@/workflow/tasks";
import {
  autoTranslateGraph,
  batchAutoTranslateGraph,
  createElementGraph,
  createTermGraph,
  createVectorizedStringGraph,
  createTranslationGraph,
  diffElementsGraph,
  fetchAdviseGraph,
  ingestCollectionGraph,
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
  tokenizeGraph,
  upsertDocumentGraph,
  vectorizeGraph,
} from "@/workflow/tasks";

export type { AgentEventBus } from "@/graph/event-bus";
export type { ExecutorPool, ExecutorTask } from "@/graph/executor-pool";
export { InProcessEventBus } from "@/graph/event-bus";
export { LocalExecutorPool, QueuedExecutorPool } from "@/graph/executor-pool";
export { GraphRegistry } from "@/graph/graph-registry";
export { NodeRegistry } from "@/graph/node-registry";
export { Scheduler, type SchedulerStartOptions } from "@/graph/scheduler";
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
export * from "@/graph/dsl";
export * from "@/graph/distributed-extensions";
export { executeWithVCS } from "@/graph/vcs-write-helper";
export { getStoredGraphRuntime as getGlobalGraphRuntime } from "@/graph/runtime-store";

export type DefaultGraphRuntime = {
  eventBus: InProcessEventBus;
  checkpointer: PostgresCheckpointer;
  executorPool: QueuedExecutorPool;
  graphRegistry: GraphRegistry;
  nodeRegistry: NodeRegistry;
  scheduler: Scheduler;
};

export const createDefaultGraphRuntime = (
  drizzle: DrizzleClient,
  _pluginManager: PluginManager,
): DefaultGraphRuntime => {
  const eventBus = new InProcessEventBus();
  const checkpointer = new PostgresCheckpointer(drizzle);
  const leaseManager = new InProcessLeaseManager();
  const compensationRegistry = new InMemoryCompensationRegistry();
  const executorPool = new QueuedExecutorPool({ leaseManager });
  const graphRegistry = new GraphRegistry();
  const nodeRegistry = new NodeRegistry();

  nodeRegistry.register("router", RouterNodeExecutor);
  nodeRegistry.register("human_input", HumanInputNodeExecutor);
  nodeRegistry.register("parallel", ParallelNodeExecutor);
  nodeRegistry.register("join", JoinNodeExecutor);
  nodeRegistry.register("loop", LoopNodeExecutor);
  nodeRegistry.register("transform", TransformNodeExecutor);
  nodeRegistry.register("subgraph", SubgraphNodeExecutor);

  graphRegistry.register(termDiscoveryGraph.graphDefinition);
  graphRegistry.register(termAlignmentGraph.graphDefinition);
  graphRegistry.register(autoTranslateGraph.graphDefinition);
  graphRegistry.register(batchAutoTranslateGraph.graphDefinition);
  graphRegistry.register(createElementGraph.graphDefinition);
  graphRegistry.register(createTermGraph.graphDefinition);
  graphRegistry.register(createVectorizedStringGraph.graphDefinition);
  graphRegistry.register(createTranslationGraph.graphDefinition);
  graphRegistry.register(diffElementsGraph.graphDefinition);
  graphRegistry.register(fetchAdviseGraph.graphDefinition);
  graphRegistry.register(ingestCollectionGraph.graphDefinition);
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
  graphRegistry.register(tokenizeGraph.graphDefinition);
  graphRegistry.register(upsertDocumentGraph.graphDefinition);
  graphRegistry.register(vectorizeGraph.graphDefinition);

  const scheduler = new Scheduler({
    eventBus,
    checkpointer,
    executorPool,
    graphRegistry,
    nodeRegistry,
    compensationRegistry,
    leaseManager,
  });

  const runtime: DefaultGraphRuntime = {
    eventBus,
    checkpointer,
    executorPool,
    graphRegistry,
    nodeRegistry,
    scheduler,
  };

  storeGraphRuntime(runtime);

  return runtime;
};
