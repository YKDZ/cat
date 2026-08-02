import { randomUUID } from "node:crypto";

import type { DrizzleClient } from "@cat/domain";
import type { PluginManager } from "@cat/plugin-core";

import { PostgresCheckpointer } from "#/graph/checkpointer/index.ts";
import { InMemoryCompensationRegistry } from "#/graph/compensation.ts";
import { InProcessEventBus } from "#/graph/event-bus.ts";
import { QueuedExecutorPool } from "#/graph/executor-pool.ts";
import {
  HumanInputNodeExecutor,
  JoinNodeExecutor,
  LoopNodeExecutor,
  ParallelNodeExecutor,
  RouterNodeExecutor,
  SubgraphNodeExecutor,
  TransformNodeExecutor,
} from "#/graph/executors/index.ts";
import { GraphRegistry } from "#/graph/graph-registry.ts";
import { InProcessLeaseManager } from "#/graph/lease.ts";
import { NodeRegistry } from "#/graph/node-registry.ts";
import { storeGraphRuntime } from "#/graph/runtime-store.ts";
import type { StoredGraphRuntime } from "#/graph/runtime-store.ts";
import { Scheduler } from "#/graph/scheduler.ts";
import {
  termAlignmentGraph,
  termDiscoveryGraph,
  WorkflowTaskProjector,
  LocalizationTaskService,
} from "#/workflow/tasks/index.ts";
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
  languageAnalyzeBatchGraph,
  languageAnalyzeGraph,
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
  upsertContentNodeGraph,
  vectorizeGraph,
} from "#/workflow/tasks/index.ts";

export type { AgentEventBus } from "#/graph/event-bus.ts";
export type { ExecutorPool, ExecutorTask } from "#/graph/executor-pool.ts";
export { InProcessEventBus } from "#/graph/event-bus.ts";
export {
  LocalExecutorPool,
  QueuedExecutorPool,
} from "#/graph/executor-pool.ts";
export { GraphRegistry } from "#/graph/graph-registry.ts";
export { NodeRegistry } from "#/graph/node-registry.ts";
export { Scheduler, type SchedulerStartOptions } from "#/graph/scheduler.ts";
export * from "#/graph/cache.ts";
export * from "#/graph/compensation.ts";
export * from "#/graph/lease.ts";
export * from "#/graph/workflow-logger.ts";
export * from "#/graph/types.ts";
export * from "#/graph/events.ts";
export * from "#/graph/blackboard.ts";
export * from "#/graph/schema-registry.ts";
export * from "#/graph/checkpointer/index.ts";
export * from "#/graph/event-store/index.ts";
export * from "#/graph/dsl/index.ts";
export * from "#/graph/distributed-extensions.ts";
export { executeWithVCS } from "#/graph/vcs-write-helper.ts";
export {
  getStoredGraphRuntime as getGlobalGraphRuntime,
  getStoredGraphRuntimeOrNull as getGlobalGraphRuntimeOrNull,
} from "#/graph/runtime-store.ts";

export type DefaultGraphRuntime = StoredGraphRuntime;

export const createDefaultGraphRuntime = (
  drizzle: DrizzleClient,
  pluginManager: PluginManager,
  options?: {
    ownerId?: string;
    ownerLeaseMs?: number;
    startReconciliationLoops?: boolean;
  },
): DefaultGraphRuntime => {
  const eventBus = new InProcessEventBus();
  const ownerId = options?.ownerId ?? randomUUID();
  const checkpointer = new PostgresCheckpointer(drizzle, {
    ownerId,
    ...(options?.ownerLeaseMs === undefined
      ? {}
      : { ownerLeaseMs: options.ownerLeaseMs }),
  });
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
  graphRegistry.register(languageAnalyzeBatchGraph.graphDefinition);
  graphRegistry.register(languageAnalyzeGraph.graphDefinition);
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
  graphRegistry.register(upsertContentNodeGraph.graphDefinition);
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
  const taskProjector = new WorkflowTaskProjector({
    db: drizzle,
    eventBus,
    checkpointer,
    scheduler,
    ownerId,
  });
  taskProjector.install();
  const taskService = new LocalizationTaskService({
    db: drizzle,
    pluginManager,
    runtime: { scheduler },
    ownerId,
  });
  if (options?.startReconciliationLoops ?? true) {
    taskProjector.startReconciliationLoop();
    taskService.startReconciliationLoop();
  }
  let taskRecovery: Promise<void> | null = null;
  const ensureTaskRecovery = (): Promise<void> => {
    taskRecovery ??= (async () => {
      await taskProjector.reconcile();
      await taskService.reconcilePending();
    })();
    return taskRecovery;
  };
  const dispose = async (): Promise<void> => {
    await taskProjector.dispose();
    await taskService.dispose();
    await scheduler.dispose();
  };

  const runtime: DefaultGraphRuntime = {
    eventBus,
    checkpointer,
    executorPool,
    graphRegistry,
    nodeRegistry,
    scheduler,
    taskProjector,
    taskService,
    ensureTaskRecovery,
    dispose,
  };

  storeGraphRuntime(runtime);

  return runtime;
};
