import { randomUUID } from "node:crypto";

import { evaluateCondition } from "@cat/graph";
import type { PluginManager } from "@cat/plugin-core";
import type { JSONObject } from "@cat/shared";
import { OperationFailureInputSchema } from "@cat/shared";
import type { VCSContext, VCSMiddleware } from "@cat/vcs";

import { Blackboard } from "#/graph/blackboard.ts";
import type { Checkpointer } from "#/graph/checkpointer/index.ts";
import type { CompensationRegistry } from "#/graph/compensation.ts";
import { InMemoryCompensationRegistry } from "#/graph/compensation.ts";
import type { AgentEventBus } from "#/graph/event-bus.ts";
import type { AgentEvent, EventEnvelopeInput } from "#/graph/events.ts";
import { createAgentEvent, normalizeEventEnvelope } from "#/graph/events.ts";
import type { ExecutorPool } from "#/graph/executor-pool.ts";
import type { GraphRegistry } from "#/graph/graph-registry.ts";
import type { LeaseManager, LeaseRecord } from "#/graph/lease.ts";
import { InProcessLeaseManager } from "#/graph/lease.ts";
import type { NodeRegistry } from "#/graph/node-registry.ts";
import type {
  GraphRuntimeContext,
  GraphDefinition,
  NodeId,
  RunId,
  RunStatus,
} from "#/graph/types.ts";
import { PatchSchema } from "#/graph/types.ts";
import {
  defaultWorkflowLogger,
  type WorkflowLogger,
} from "#/graph/workflow-logger.ts";

type RunContext = {
  runId: RunId;
  graph: GraphDefinition;
  blackboard: Blackboard;
  runtime: GraphRuntimeContext;
  deduplicationKey?: string | undefined;
  metadata?: JSONObject | null | undefined;
  status: RunStatus;
  abortController: AbortController;
  cancelRequested: boolean;
  dispatches: Set<Promise<void>>;
  pendingNodeIds: Set<NodeId>;
  currentNodeIds: Set<NodeId>;
  completedNodes: Set<NodeId>;
};

export type SchedulerOptions = {
  eventBus: AgentEventBus;
  checkpointer: Checkpointer;
  executorPool: ExecutorPool;
  graphRegistry: GraphRegistry;
  nodeRegistry: NodeRegistry;
  compensationRegistry?: CompensationRegistry;
  leaseManager?: LeaseManager;
  reclaimIntervalMs?: number;
  reclaimCooldownMs?: number;
  cancellationTimeoutMs?: number;
  logger?: WorkflowLogger;
};

export type SchedulerStartOptions = {
  /** DB-internal session ID, used to associate AgentRun records */
  sessionId?: number | undefined;
  /** Additional persisted run metadata */
  metadata?: JSONObject | null | undefined;
  deduplicationKey?: string | undefined;
  /** Plugin manager instance for this run */
  pluginManager?: PluginManager | undefined;
  /** Optional VCS context for Direct mode audit */
  vcsContext?: VCSContext | undefined;
  /** Optional VCS middleware instance */
  vcsMiddleware?: VCSMiddleware | undefined;
  /** Invoked after a run ID is allocated and before lifecycle events can fire. */
  onRunCreated?: ((runId: RunId) => Promise<void>) | undefined;
  ownershipFence?:
    | import("#/graph/checkpointer/types.ts").RunOwnershipFence
    | null;
  assertRunOwnership?: (() => Promise<void>) | undefined;
};

export type SchedulerRecoverOptions = {
  runtime?: GraphRuntimeContext | undefined;
  cancelRequested?: boolean | undefined;
};

export class WorkflowRunOwnershipConflictError extends Error {
  constructor(runId: RunId) {
    super(`Workflow run ${runId} is owned by another live instance.`);
    this.name = "WorkflowRunOwnershipConflictError";
  }
}

const SCHEDULER_PENDING_NODE_IDS_KEY = "__scheduler.pendingNodeIds";

const toRecord = (value: unknown): JSONObject => {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return { ...value };
  }
  return {};
};

const toConfigObject = (value: unknown): JSONObject => {
  return toRecord(value);
};

const toNodeIdList = (value: unknown): NodeId[] => {
  if (!Array.isArray(value)) return [];

  const nodeIds: NodeId[] = [];
  for (const item of value) {
    if (typeof item !== "string" || item.length === 0) continue;
    if (!nodeIds.includes(item)) {
      nodeIds.push(item);
    }
  }

  return nodeIds;
};

const withPendingNodeIds = (
  metadata: JSONObject | null | undefined,
  pendingNodeIds: Iterable<NodeId>,
): JSONObject | null => {
  const result = toRecord(metadata);
  const nodeIds = toNodeIdList(Array.from(pendingNodeIds));

  if (nodeIds.length > 0) {
    result[SCHEDULER_PENDING_NODE_IDS_KEY] = nodeIds;
  } else {
    delete result[SCHEDULER_PENDING_NODE_IDS_KEY];
  }

  return Object.keys(result).length > 0 ? result : null;
};

const getPendingNodeIds = (
  metadata: JSONObject | null | undefined,
  currentNodeId?: NodeId,
): Set<NodeId> => {
  const persisted = toNodeIdList(
    Reflect.get(toRecord(metadata), SCHEDULER_PENDING_NODE_IDS_KEY),
  );

  if (persisted.length > 0) {
    return new Set<NodeId>(persisted);
  }

  if (currentNodeId) {
    return new Set<NodeId>([currentNodeId]);
  }

  return new Set<NodeId>();
};

const getFirstPendingNodeId = (
  pendingNodeIds: Set<NodeId>,
): NodeId | undefined => {
  for (const nodeId of pendingNodeIds) {
    return nodeId;
  }

  return undefined;
};

export class Scheduler {
  readonly eventBus: AgentEventBus;

  readonly checkpointer: Checkpointer;

  readonly executorPool: ExecutorPool;

  readonly graphRegistry: GraphRegistry;

  readonly nodeRegistry: NodeRegistry;

  readonly compensationRegistry: CompensationRegistry;

  readonly leaseManager: LeaseManager;

  readonly logger: WorkflowLogger;

  private readonly reclaimIntervalMs: number;

  private readonly reclaimCooldownMs: number;

  private readonly cancellationTimeoutMs: number;

  private activeRuns = new Map<RunId, RunContext>();

  private pausedRuns = new Map<RunId, RunContext>();

  private cancellationFinalizers = new Map<RunId, Promise<void>>();

  private reclaimTimer: ReturnType<typeof setInterval> | null = null;
  private ownerHeartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private readonly delayedCallbacks = new Set<ReturnType<typeof setTimeout>>();
  private readonly terminalCompletions = new Map<RunId, Promise<void>>();
  private disposed = false;

  constructor(options: SchedulerOptions) {
    this.eventBus = options.eventBus;
    this.checkpointer = options.checkpointer;
    this.executorPool = options.executorPool;
    this.graphRegistry = options.graphRegistry;
    this.nodeRegistry = options.nodeRegistry;
    this.compensationRegistry =
      options.compensationRegistry ?? new InMemoryCompensationRegistry();
    this.leaseManager = options.leaseManager ?? new InProcessLeaseManager();
    this.logger = options.logger ?? defaultWorkflowLogger;
    this.reclaimIntervalMs = options.reclaimIntervalMs ?? 30_000;
    this.reclaimCooldownMs = options.reclaimCooldownMs ?? 5_000;
    this.cancellationTimeoutMs = options.cancellationTimeoutMs ?? 10_000;

    this.setupEventHandlers();
    this.startReclaimLoop();
    this.startOwnerHeartbeat();
  }

  private setupEventHandlers = (): void => {
    this.eventBus.subscribe("node:end", this.onNodeEnd);
    this.eventBus.subscribe("node:error", this.onNodeError);
    this.eventBus.subscribe(
      "human:input:received",
      this.handleHumanInputReceived,
    );
    this.eventBus.subscribe("run:pause", this.onRunPause);
    this.eventBus.subscribe("run:resume", this.onRunResume);
    this.eventBus.subscribe("run:cancel", this.onRunCancel);

    this.eventBus.subscribeAll(async (event) => {
      await this.checkpointer.saveEvent(event);
    });
  };

  private buildRuntime = (
    runId: RunId,
    options?: SchedulerStartOptions,
  ): GraphRuntimeContext => {
    const ownershipRunId = options?.ownershipFence?.runId ?? runId;
    const ownershipRequired =
      options?.ownershipFence != null || options?.sessionId !== undefined;
    return {
      pluginManager: options?.pluginManager,
      vcsContext: options?.vcsContext,
      vcsMiddleware: options?.vcsMiddleware,
      assertRunOwnership:
        options?.assertRunOwnership ??
        (async () => {
          if (!ownershipRequired) return;
          if (!(await this.checkpointer.renewRunOwnership(ownershipRunId))) {
            throw new Error("Workflow owner lease lost");
          }
        }),
      ownershipFence: options?.ownershipFence ?? null,
    };
  };

  private assertContextOwnership = async (
    context: RunContext,
  ): Promise<void> => {
    if (context.runtime.ownershipFence == null) return;
    if (!context.runtime.assertRunOwnership) {
      throw new Error("Workflow ownership assertion is missing");
    }
    await context.runtime.assertRunOwnership();
  };

  start = async (
    graphId: string,
    input: JSONObject,
    options?: SchedulerStartOptions,
  ): Promise<RunId> => {
    if (this.disposed) throw new Error("Scheduler is disposed.");
    if (options?.deduplicationKey) {
      const existing = await this.checkpointer.findRunByDeduplicationKey(
        options.deduplicationKey,
      );
      if (
        existing &&
        (existing.status === "running" || existing.status === "paused")
      ) {
        if (!(await this.checkpointer.claimRunOwnership(existing.runId))) {
          throw new WorkflowRunOwnershipConflictError(existing.runId);
        }
        const runtime = this.buildRuntime(existing.runId, options);
        runtime.ownershipFence = this.checkpointer.getRunOwnershipFence(
          existing.runId,
        );
        const snapshot = await this.checkpointer.loadSnapshot(existing.runId);
        if (!snapshot) {
          const repaired = new Blackboard({
            runId: existing.runId,
            initialData: { ...input },
          });
          await this.checkpointer.saveSnapshot(
            existing.runId,
            repaired.getSnapshot(),
          );
        }
        await options?.onRunCreated?.(existing.runId);
        await this.recover(existing.runId, { runtime });
        return existing.runId;
      }
    }

    const runId = randomUUID();
    const graph = this.graphRegistry.get(graphId);

    const initialData: Record<string, unknown> = { ...input };

    const runtime = this.buildRuntime(runId, options);
    const persistedMetadata = {
      ...(options?.metadata ?? {}),
      ...(options?.sessionId !== undefined
        ? { sessionId: options.sessionId }
        : {}),
    };

    const blackboard = new Blackboard({
      runId,
      initialData,
    });

    const context: RunContext = {
      runId,
      graph,
      blackboard,
      runtime,
      deduplicationKey: options?.deduplicationKey,
      metadata:
        Object.keys(persistedMetadata).length > 0 ? persistedMetadata : null,
      status: "running",
      abortController: new AbortController(),
      cancelRequested: false,
      dispatches: new Set(),
      pendingNodeIds: new Set<NodeId>(),
      currentNodeIds: new Set<NodeId>(),
      completedNodes: new Set<NodeId>(),
    };

    this.activeRuns.set(runId, context);

    await this.checkpointer.saveRunMetadata(runId, {
      graphId,
      status: "running",
      deduplicationKey: options?.deduplicationKey,
      startedAt: new Date().toISOString(),
      graphDefinition: graph,
      metadata: withPendingNodeIds(context.metadata, context.pendingNodeIds),
    });
    if (
      options?.sessionId !== undefined &&
      !(await this.checkpointer.claimRunOwnership(runId))
    ) {
      this.activeRuns.delete(runId);
      throw new Error(`Could not claim persisted workflow run ${runId}.`);
    }
    if (options?.sessionId !== undefined) {
      context.runtime.ownershipFence =
        this.checkpointer.getRunOwnershipFence(runId);
    }

    try {
      await this.checkpointer.saveSnapshot(runId, blackboard.getSnapshot());
      await options?.onRunCreated?.(runId);
    } catch (error) {
      await this.abandonRunAllocation(runId).catch((cleanupError: unknown) => {
        this.logger.scheduler("run:allocation-cleanup:error", {
          runId,
          error:
            cleanupError instanceof Error
              ? cleanupError.message
              : String(cleanupError),
        });
      });
      throw error;
    }

    await this.eventBus.publish(
      createAgentEvent({
        runId,
        type: "run:start",
        timestamp: new Date().toISOString(),
        payload: { graphId, input },
      }),
    );

    this.enqueuePendingNode(context, graph.entry);
    this.drainPendingNodes(runId);

    return runId;
  };

  pause = async (runId: RunId, pausedNodeId?: NodeId): Promise<void> => {
    const context = this.activeRuns.get(runId);
    if (!context) {
      throw new Error(`Run not active: ${runId}`);
    }

    context.status = "paused";
    if (pausedNodeId) {
      context.pendingNodeIds.add(pausedNodeId);
    }
    this.activeRuns.delete(runId);
    this.pausedRuns.set(runId, context);

    await this.checkpointer.saveRunMetadata(runId, {
      graphId: context.graph.id,
      status: "paused",
      currentNodeId:
        pausedNodeId ?? getFirstPendingNodeId(context.pendingNodeIds),
      deduplicationKey: context.deduplicationKey,
      startedAt: context.blackboard.getSnapshot().createdAt,
      graphDefinition: context.graph,
      metadata: withPendingNodeIds(context.metadata, context.pendingNodeIds),
    });

    await this.eventBus.publish(
      createAgentEvent({
        runId,
        type: "run:pause",
        timestamp: new Date().toISOString(),
        payload: {},
      }),
    );
  };

  cancel = async (runId: RunId): Promise<void> => {
    const terminalCompletion = this.terminalCompletions.get(runId);
    if (terminalCompletion) {
      await terminalCompletion;
      return;
    }
    if (!this.hasRun(runId)) {
      const metadata = await this.checkpointer.loadRunMetadata(runId);
      if (
        !metadata ||
        (metadata.status !== "running" && metadata.status !== "paused")
      ) {
        throw new Error(`Run not active: ${runId}`);
      }
      await this.recover(runId);
    }
    await this.eventBus.publish(
      createAgentEvent({
        runId,
        type: "run:cancel",
        timestamp: new Date().toISOString(),
        payload: {},
      }),
    );
  };

  resume = async (runId: RunId): Promise<void> => {
    const context = this.pausedRuns.get(runId);
    if (!context) {
      throw new Error(`Run not paused: ${runId}`);
    }

    await this.assertContextOwnership(context);

    context.status = "running";
    this.pausedRuns.delete(runId);
    this.activeRuns.set(runId, context);

    const pendingNodeIds = [...context.pendingNodeIds];
    context.pendingNodeIds.clear();

    const nodesToDispatch =
      pendingNodeIds.length > 0
        ? pendingNodeIds
        : context.currentNodeIds.size === 0
          ? [context.graph.entry]
          : [];

    await this.checkpointer.saveRunMetadata(runId, {
      graphId: context.graph.id,
      status: "running",
      currentNodeId: nodesToDispatch[0],
      deduplicationKey: context.deduplicationKey,
      startedAt: context.blackboard.getSnapshot().createdAt,
      graphDefinition: context.graph,
      metadata: withPendingNodeIds(context.metadata, context.pendingNodeIds),
    });

    await this.eventBus.publish(
      createAgentEvent({
        runId,
        type: "run:resume",
        timestamp: new Date().toISOString(),
        payload: {},
      }),
    );

    for (const nodeId of nodesToDispatch) {
      this.enqueuePendingNode(context, nodeId);
    }
    this.drainPendingNodes(runId);
  };

  private scheduleNodeDispatch = (runId: RunId, nodeId: NodeId): void => {
    const context = this.activeRuns.get(runId);
    if (!context || context.cancelRequested) return;
    context.currentNodeIds.add(nodeId);

    const dispatch = Promise.resolve()
      .then(async () => {
        if (context.runtime.ownershipFence != null) {
          try {
            await this.assertContextOwnership(context);
          } catch (error) {
            context.abortController.abort(
              new Error("Workflow owner lease lost"),
            );
            throw error;
          }
        }
        await this.dispatchNode(runId, nodeId);
      })
      .catch(async (error: unknown) => {
        await this.handleDispatchFailure(runId, nodeId, error);
      });
    context.dispatches.add(dispatch);
    void dispatch.finally(() => {
      context.dispatches.delete(dispatch);
    });
  };

  private handleDispatchFailure = async (
    runId: RunId,
    nodeId: NodeId,
    error: unknown,
  ): Promise<void> => {
    const operationFailure = OperationFailureInputSchema.safeParse(
      typeof error === "object" && error !== null
        ? Reflect.get(error, "operationFailure")
        : undefined,
    );
    await this.eventBus.publish(
      createAgentEvent({
        runId,
        nodeId,
        type: "run:error",
        timestamp: new Date().toISOString(),
        payload: {
          error: error instanceof Error ? error.message : String(error),
          ...(operationFailure.success
            ? { operationFailure: operationFailure.data }
            : {}),
        },
      }),
    );

    const context = this.activeRuns.get(runId) ?? this.pausedRuns.get(runId);
    if (!context?.cancelRequested) await this.completeRun(runId, "failed");
  };

  recover = async (
    runId: RunId,
    options?: SchedulerRecoverOptions,
  ): Promise<void> => {
    if (this.terminalCompletions.has(runId)) return;
    const existingContext =
      this.activeRuns.get(runId) ?? this.pausedRuns.get(runId) ?? null;
    if (existingContext) {
      if (options?.runtime) {
        existingContext.runtime = {
          ...existingContext.runtime,
          ...options.runtime,
        };
      }
      if (options?.cancelRequested && !existingContext.cancelRequested) {
        existingContext.cancelRequested = true;
        existingContext.abortController.abort(
          new DOMException("Cancelled", "AbortError"),
        );
      }
      return;
    }

    if (!(await this.checkpointer.claimRunOwnership(runId))) {
      throw new WorkflowRunOwnershipConflictError(runId);
    }

    const metadata = await this.checkpointer.loadRunMetadata(runId);
    if (!metadata) {
      throw new Error(`Run metadata not found: ${runId}`);
    }

    const snapshot = await this.checkpointer.loadSnapshot(runId);
    if (!snapshot) {
      throw new Error(`Run snapshot not found: ${runId}`);
    }

    const graph =
      metadata.graphDefinition ?? this.graphRegistry.get(metadata.graphId);
    const blackboard = Blackboard.fromSnapshot(snapshot);

    const runtime = options?.runtime ?? {};
    runtime.ownershipFence = this.checkpointer.getRunOwnershipFence(runId);
    runtime.assertRunOwnership ??= async () => {
      if (!(await this.checkpointer.renewRunOwnership(runId))) {
        throw new Error("Workflow owner lease lost");
      }
    };

    const abortController = new AbortController();
    if (options?.cancelRequested) {
      abortController.abort(new DOMException("Cancelled", "AbortError"));
    }
    const context: RunContext = {
      runId,
      graph,
      blackboard,
      runtime,
      deduplicationKey: metadata.deduplicationKey,
      metadata: metadata.metadata,
      status: metadata.status,
      abortController,
      cancelRequested: options?.cancelRequested ?? false,
      dispatches: new Set(),
      pendingNodeIds: getPendingNodeIds(
        metadata.metadata,
        metadata.currentNodeId,
      ),
      currentNodeIds: new Set<NodeId>(),
      completedNodes: new Set<NodeId>(),
    };

    if (metadata.status === "paused") {
      this.pausedRuns.set(runId, context);
      return;
    }

    this.activeRuns.set(runId, context);
    const nodes =
      context.pendingNodeIds.size > 0
        ? [...context.pendingNodeIds]
        : [context.graph.entry];
    context.pendingNodeIds.clear();
    for (const nodeId of nodes) this.enqueuePendingNode(context, nodeId);
    this.drainPendingNodes(runId);
  };

  dispose = async (): Promise<void> => {
    if (this.disposed) return;
    this.disposed = true;
    this.stopReclaimLoop();
    this.stopOwnerHeartbeat();
    for (const timer of this.delayedCallbacks) clearTimeout(timer);
    this.delayedCallbacks.clear();
    for (const context of this.activeRuns.values()) {
      context.abortController.abort(new Error("Scheduler disposed"));
    }
    await Promise.allSettled(this.cancellationFinalizers.values());
    await Promise.allSettled(this.terminalCompletions.values());
    await this.executorPool.shutdown?.();
  };

  startReclaimLoop = (): void => {
    if (this.reclaimTimer) return;
    this.reclaimTimer = setInterval(() => {
      void this.reclaimExpiredLeases();
    }, this.reclaimIntervalMs);
  };

  stopReclaimLoop = (): void => {
    if (!this.reclaimTimer) return;
    clearInterval(this.reclaimTimer);
    this.reclaimTimer = null;
  };

  private startOwnerHeartbeat = (): void => {
    if (this.ownerHeartbeatTimer) return;
    this.ownerHeartbeatTimer = setInterval(() => {
      const ownedContexts = [
        ...this.activeRuns.values(),
        ...this.pausedRuns.values(),
      ];
      for (const context of ownedContexts) {
        if (context.runtime.ownershipFence == null) continue;
        void this.assertContextOwnership(context).catch(() => {
          context.abortController.abort(new Error("Workflow owner lease lost"));
        });
      }
    }, 10_000);
    this.ownerHeartbeatTimer.unref?.();
  };

  private stopOwnerHeartbeat = (): void => {
    if (!this.ownerHeartbeatTimer) return;
    clearInterval(this.ownerHeartbeatTimer);
    this.ownerHeartbeatTimer = null;
  };

  private reclaimExpiredLeases = async (): Promise<void> => {
    const expired = await this.leaseManager.findExpired();
    for (const lease of expired) {
      // oxlint-disable-next-line no-await-in-loop
      await this.reclaimLease(lease);
    }
  };

  private reclaimLease = async (lease: LeaseRecord): Promise<void> => {
    const context = this.activeRuns.get(lease.runId);
    if (!context || context.status !== "running" || context.cancelRequested)
      return;
    if (!context.currentNodeIds.has(lease.nodeId)) return;

    context.currentNodeIds.delete(lease.nodeId);
    this.enqueuePendingNode(context, lease.nodeId);
    await this.eventBus.publish(
      createAgentEvent({
        runId: lease.runId,
        nodeId: lease.nodeId,
        type: "node:lease:reclaimed",
        timestamp: new Date().toISOString(),
        payload: {
          leaseId: lease.leaseId,
          expiresAt: lease.expiresAt,
        },
      }),
    );

    this.scheduleDelayed(() => {
      this.drainPendingNodes(lease.runId);
    }, this.reclaimCooldownMs);
  };

  private enqueuePendingNode = (context: RunContext, nodeId: NodeId): void => {
    if (context.currentNodeIds.has(nodeId)) return;
    context.pendingNodeIds.add(nodeId);
  };

  private getMaxConcurrentNodes = (graph: GraphDefinition): number => {
    return graph.config?.maxConcurrentNodes ?? 3;
  };

  private drainPendingNodes = (runId: RunId): void => {
    const context = this.activeRuns.get(runId);
    if (!context || context.status !== "running" || context.cancelRequested)
      return;

    const maxConcurrentNodes = this.getMaxConcurrentNodes(context.graph);
    while (
      context.currentNodeIds.size < maxConcurrentNodes &&
      context.pendingNodeIds.size > 0
    ) {
      const nextNodeId = getFirstPendingNodeId(context.pendingNodeIds);
      if (!nextNodeId) return;
      context.pendingNodeIds.delete(nextNodeId);
      this.scheduleNodeDispatch(runId, nextNodeId);
    }
  };

  private dispatchNode = async (
    runId: RunId,
    nodeId: NodeId,
  ): Promise<void> => {
    const context = this.activeRuns.get(runId);
    if (!context || context.status !== "running" || context.cancelRequested)
      return;

    const nodeDef = context.graph.nodes[nodeId];
    if (!nodeDef) {
      throw new Error(`Node not found in graph: ${nodeId}`);
    }

    await this.eventBus.publish(
      createAgentEvent({
        runId,
        nodeId,
        type: "node:start",
        timestamp: new Date().toISOString(),
        payload: {
          nodeType: nodeDef.type,
          config: nodeDef.config ?? null,
        },
      }),
    );

    const executor = this.nodeRegistry.getExecutor(nodeDef.type);
    const idempotencyKey = this.computeIdempotencyKey(
      nodeId,
      context.blackboard.getSnapshot().version,
    );

    const emitProxy = async (event: EventEnvelopeInput): Promise<void> => {
      await this.eventBus.publish(
        createAgentEvent(normalizeEventEnvelope(runId, nodeId, event)),
      );
    };

    const publishToStream = async (
      events: EventEnvelopeInput[],
    ): Promise<void> => {
      for (const event of events) {
        // oxlint-disable-next-line no-await-in-loop
        await this.eventBus.publish(
          createAgentEvent(normalizeEventEnvelope(runId, nodeId, event)),
        );
      }
    };

    await this.executorPool.submit({
      runId,
      nodeId,
      nodeDef,
      executor,
      config: toConfigObject(nodeDef.config),
      runtime: context.runtime,
      snapshot: context.blackboard.getSnapshot(),
      checkpointer: this.checkpointer,
      emitProxy,
      publishToStream,
      signal: context.abortController.signal,
      idempotencyKey,
      retry: nodeDef.retry,
    });
  };

  private computeIdempotencyKey = (nodeId: string, version: number): string => {
    return `${nodeId}:${version}`;
  };

  private onNodeEnd = async (event: AgentEvent): Promise<void> => {
    if (!event.nodeId) return;

    const context =
      this.activeRuns.get(event.runId) ?? this.pausedRuns.get(event.runId);
    if (!context) return;
    if (context.cancelRequested) return;

    const payload = toRecord(event.payload);
    const patchCandidate = payload["patch"];
    const parsedPatch = PatchSchema.safeParse(patchCandidate);
    const patchLike = parsedPatch.success ? parsedPatch.data : null;

    if (patchLike) {
      const patchResult = context.blackboard.applyPatch(patchLike);
      if (!patchResult.ok) {
        await this.eventBus.publish(
          createAgentEvent({
            runId: event.runId,
            nodeId: event.nodeId,
            type: "run:error",
            timestamp: new Date().toISOString(),
            payload: {
              error: patchResult.error,
            },
          }),
        );
        await this.completeRun(event.runId, "failed");
        return;
      }
    }

    await this.checkpointer.saveSnapshot(
      event.runId,
      context.blackboard.getSnapshot(),
    );

    context.currentNodeIds.delete(event.nodeId);
    context.completedNodes.add(event.nodeId);

    const status = payload.status;
    if (status === "paused") {
      this.scheduleDelayed(() => {
        void this.pause(event.runId, event.nodeId);
      }, 0);
      return;
    }

    const nextNodes = this.evaluateNextNodes(context, event.nodeId);
    if (nextNodes.length === 0 && context.currentNodeIds.size === 0) {
      this.scheduleDelayed(() => {
        void this.completeRun(event.runId, "completed");
      }, 0);
      return;
    }

    if (context.status === "paused") {
      for (const nextNodeId of nextNodes) {
        context.pendingNodeIds.add(nextNodeId);
      }

      await this.checkpointer.saveRunMetadata(event.runId, {
        graphId: context.graph.id,
        status: "paused",
        currentNodeId: getFirstPendingNodeId(context.pendingNodeIds),
        startedAt: context.blackboard.getSnapshot().createdAt,
        graphDefinition: context.graph,
        metadata: withPendingNodeIds(context.metadata, context.pendingNodeIds),
      });
      return;
    }

    for (const nextNodeId of nextNodes) {
      this.enqueuePendingNode(context, nextNodeId);
    }
    this.drainPendingNodes(event.runId);
  };

  private onNodeError = async (event: AgentEvent): Promise<void> => {
    const context =
      this.activeRuns.get(event.runId) ?? this.pausedRuns.get(event.runId);
    if (context?.cancelRequested) return;
    await this.eventBus.publish(
      createAgentEvent({
        runId: event.runId,
        nodeId: event.nodeId,
        type: "run:error",
        timestamp: new Date().toISOString(),
        payload: event.payload,
      }),
    );
    await this.completeRun(event.runId, "failed");
  };

  handleHumanInputReceived = async (event: AgentEvent): Promise<void> => {
    const context = this.pausedRuns.get(event.runId);
    if (!context) return;

    const payload = toRecord(event.payload);
    const nodeId = payload.nodeId;

    if (typeof nodeId !== "string") {
      await this.resume(event.runId);
      return;
    }

    context.pendingNodeIds.delete(nodeId);
    await this.resume(event.runId);
    this.scheduleNodeDispatch(event.runId, nodeId);
  };

  private onRunPause = async (_event: AgentEvent): Promise<void> => {
    return;
  };

  private onRunResume = async (_event: AgentEvent): Promise<void> => {
    return;
  };

  private onRunCancel = async (event: AgentEvent): Promise<void> => {
    const context =
      this.activeRuns.get(event.runId) ?? this.pausedRuns.get(event.runId);
    if (!context) return;

    if (!context.cancelRequested) {
      context.cancelRequested = true;
      context.abortController.abort(
        new DOMException("Cancelled", "AbortError"),
      );
    }

    let finalizer = this.cancellationFinalizers.get(event.runId);
    if (!finalizer) {
      finalizer = Promise.allSettled([...context.dispatches]).then(async () => {
        await this.completeRun(event.runId, "cancelled");
        this.cancellationFinalizers.delete(event.runId);
        return undefined;
      });
      this.cancellationFinalizers.set(event.runId, finalizer);
    }

    const completed = await Promise.race([
      finalizer.then(() => true),
      new Promise<false>((resolve) => {
        setTimeout(() => resolve(false), this.cancellationTimeoutMs);
      }),
    ]);
    if (!completed) return;
    await finalizer;
  };

  private evaluateNextNodes = (
    context: RunContext,
    completedNodeId: NodeId,
  ): NodeId[] => {
    const outgoing = context.graph.edges.filter(
      (edge) => edge.from === completedNodeId,
    );
    const matched = outgoing
      .filter((edge) => {
        if (!edge.condition) return true;
        return evaluateCondition(
          edge.condition,
          context.blackboard.getSnapshot().data,
        );
      })
      .map((edge) => edge.to);

    return matched.filter((nodeId) => {
      const predecessors = context.graph.edges.filter(
        (edge) => edge.to === nodeId,
      );
      return predecessors.every((edge) =>
        context.completedNodes.has(edge.from),
      );
    });
  };

  private completeRun = async (
    runId: RunId,
    status: RunStatus,
  ): Promise<void> => {
    const existing = this.terminalCompletions.get(runId);
    if (existing) return await existing;
    const completion = this.finishRun(runId, status).finally(() => {
      if (this.terminalCompletions.get(runId) === completion) {
        this.terminalCompletions.delete(runId);
      }
    });
    this.terminalCompletions.set(runId, completion);
    await completion;
  };

  private abandonRunAllocation = async (runId: RunId): Promise<void> => {
    const context = this.activeRuns.get(runId);
    if (!context) return;
    this.activeRuns.delete(runId);
    context.abortController.abort(new Error("Workflow allocation abandoned"));
    this.compensationRegistry.clear(runId);
    const sessionId = context.metadata?.["sessionId"];
    await this.checkpointer.saveRunMetadata(runId, {
      graphId: context.graph.id,
      status: "failed",
      deduplicationKey: undefined,
      startedAt: context.blackboard.getSnapshot().createdAt,
      completedAt: new Date().toISOString(),
      graphDefinition: context.graph,
      metadata: typeof sessionId === "number" ? { sessionId } : null,
    });
  };

  private finishRun = async (
    runId: RunId,
    status: RunStatus,
  ): Promise<void> => {
    const context = this.activeRuns.get(runId) ?? this.pausedRuns.get(runId);
    if (!context) return;

    context.status = status;

    if (status === "failed" || status === "cancelled") {
      await this.eventBus.publish(
        createAgentEvent({
          runId,
          type: "run:compensation:start",
          timestamp: new Date().toISOString(),
          payload: {
            count: this.compensationRegistry.count(runId),
          },
        }),
      );

      const compensation = await this.compensationRegistry.execute(runId);
      await this.eventBus.publish(
        createAgentEvent({
          runId,
          type: "run:compensation:end",
          timestamp: new Date().toISOString(),
          payload: compensation,
        }),
      );
    } else {
      this.compensationRegistry.clear(runId);
    }

    await this.checkpointer.saveRunMetadata(runId, {
      graphId: context.graph.id,
      status,
      deduplicationKey: undefined,
      startedAt: context.blackboard.getSnapshot().createdAt,
      completedAt: new Date().toISOString(),
      graphDefinition: context.graph,
      metadata: withPendingNodeIds(context.metadata, context.pendingNodeIds),
    });

    this.activeRuns.delete(runId);
    this.pausedRuns.delete(runId);

    await this.eventBus.publish(
      createAgentEvent({
        runId,
        type: "run:end",
        timestamp: new Date().toISOString(),
        payload: {
          status,
          blackboard: context.blackboard.getSnapshot().data,
        },
      }),
    );
  };

  private scheduleDelayed = (callback: () => void, delayMs: number): void => {
    if (this.disposed) return;
    const timer = setTimeout(() => {
      this.delayedCallbacks.delete(timer);
      if (!this.disposed) callback();
    }, delayMs);
    this.delayedCallbacks.add(timer);
  };

  hasPausedRun = (runId: RunId): boolean => {
    return this.pausedRuns.has(runId);
  };

  hasRun = (runId: RunId): boolean => {
    return (
      this.activeRuns.has(runId) ||
      this.pausedRuns.has(runId) ||
      this.terminalCompletions.has(runId)
    );
  };

  /**
   * Return the list of run IDs currently active in this process.
   *
   * @returns - List of active run IDs
   */
  getActiveRunIds = (): RunId[] => {
    return [...this.activeRuns.keys()];
  };
}
