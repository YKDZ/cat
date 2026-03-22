import type { ChatMessage, LLMProvider, PluginManager } from "@cat/plugin-core";

import * as crypto from "node:crypto";

import type { Checkpointer } from "@/graph/checkpointer";
import type { CompensationRegistry } from "@/graph/compensation";
import type { EventBus } from "@/graph/event-bus";
import type { AgentEvent, EventEnvelopeInput } from "@/graph/events";
import type { ExecutorPool } from "@/graph/executor-pool";
import type { GraphRegistry } from "@/graph/graph-registry";
import type { LeaseManager, LeaseRecord } from "@/graph/lease";
import type { NodeRegistry } from "@/graph/node-registry";
import type {
  EdgeCondition,
  GraphRuntimeContext,
  GraphDefinition,
  NodeId,
  RunId,
  RunStatus,
} from "@/graph/types";
import type { AgentToolDefinition } from "@/tools/types";

import { Blackboard, buildPatch } from "@/graph/blackboard";
import { InMemoryCompensationRegistry } from "@/graph/compensation";
import { createAgentEvent, normalizeEventEnvelope } from "@/graph/events";
import { InProcessLeaseManager } from "@/graph/lease";
import { PatchSchema } from "@/graph/types";
import {
  defaultWorkflowLogger,
  type WorkflowLogger,
} from "@/graph/workflow-logger";

type RunContext = {
  runId: RunId;
  graph: GraphDefinition;
  blackboard: Blackboard;
  runtime: GraphRuntimeContext;
  deduplicationKey?: string;
  metadata?: Record<string, unknown> | null;
  status: RunStatus;
  pendingNodeIds: Set<NodeId>;
  currentNodeIds: Set<NodeId>;
  completedNodes: Set<NodeId>;
};

export type SchedulerOptions = {
  eventBus: EventBus;
  checkpointer: Checkpointer;
  executorPool: ExecutorPool;
  graphRegistry: GraphRegistry;
  nodeRegistry: NodeRegistry;
  compensationRegistry?: CompensationRegistry;
  leaseManager?: LeaseManager;
  reclaimIntervalMs?: number;
  reclaimCooldownMs?: number;
  logger?: WorkflowLogger;
};

export type SchedulerStartOptions = {
  /** DB-internal session ID, used to associate AgentRun records */
  sessionId?: number;
  /** Already-resolved LLM provider instance */
  llmProvider?: LLMProvider;
  /** Already-registered server-side tools */
  tools?: AgentToolDefinition[];
  /** Fully-built system prompt string */
  systemPrompt?: string;
  /** Conversation history (including the new user message at the end) */
  messages?: ChatMessage[];
  /** Additional persisted run metadata */
  metadata?: Record<string, unknown> | null;
  deduplicationKey?: string;
  /** Plugin manager instance for this run */
  pluginManager?: PluginManager;
};

export type SchedulerRecoverOptions = {
  runtime?: GraphRuntimeContext;
};

const SCHEDULER_PENDING_NODE_IDS_KEY = "__scheduler.pendingNodeIds";

const parseExpectedValue = (raw: string): string | number | boolean | null => {
  if (raw === "true") return true;
  if (raw === "false") return false;
  if (raw === "null") return null;
  const asNumber = Number(raw);
  if (!Number.isNaN(asNumber) && raw.trim() !== "") return asNumber;
  return raw;
};

const resolvePath = (data: unknown, path: string): unknown => {
  if (typeof path !== "string" || path.length === 0) return undefined;
  const segments = path.split(".").filter(Boolean);
  let cursor: unknown = data;

  for (const segment of segments) {
    if (typeof cursor !== "object" || cursor === null) return undefined;
    cursor = Reflect.get(cursor, segment);
  }

  return cursor;
};

const toRecord = (value: unknown): Record<string, unknown> => {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return { ...value };
  }
  return {};
};

const toConfigObject = (value: unknown): Record<string, unknown> => {
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
  metadata: Record<string, unknown> | null | undefined,
  pendingNodeIds: Iterable<NodeId>,
): Record<string, unknown> | null => {
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
  metadata: Record<string, unknown> | null | undefined,
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
  readonly eventBus: EventBus;

  readonly checkpointer: Checkpointer;

  readonly executorPool: ExecutorPool;

  readonly graphRegistry: GraphRegistry;

  readonly nodeRegistry: NodeRegistry;

  readonly compensationRegistry: CompensationRegistry;

  readonly leaseManager: LeaseManager;

  readonly logger: WorkflowLogger;

  private readonly reclaimIntervalMs: number;

  private readonly reclaimCooldownMs: number;

  private activeRuns = new Map<RunId, RunContext>();

  private pausedRuns = new Map<RunId, RunContext>();

  private reclaimTimer: ReturnType<typeof setInterval> | null = null;

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

    this.setupEventHandlers();
    this.startReclaimLoop();
  }

  private setupEventHandlers = (): void => {
    this.eventBus.subscribe("node:end", this.onNodeEnd);
    this.eventBus.subscribe("node:error", this.onNodeError);
    this.eventBus.subscribe(
      "human:input:received",
      this.handleHumanInputReceived,
    );
    this.eventBus.subscribe(
      "tool:confirm:response",
      this.handleToolConfirmResponse,
    );
    this.eventBus.subscribe("run:pause", this.onRunPause);
    this.eventBus.subscribe("run:resume", this.onRunResume);
    this.eventBus.subscribe("run:cancel", this.onRunCancel);

    this.eventBus.subscribeAll(async (event) => {
      await this.checkpointer.saveEvent(event);
    });
  };

  start = async (
    graphId: string,
    input: Record<string, unknown>,
    options?: SchedulerStartOptions,
  ): Promise<RunId> => {
    if (options?.deduplicationKey) {
      const existing = await this.checkpointer.findRunByDeduplicationKey(
        options.deduplicationKey,
      );
      if (
        existing &&
        (existing.status === "running" || existing.status === "paused")
      ) {
        await this.recover(existing.runId, { runtime: undefined });
        return existing.runId;
      }
    }

    const runId = crypto.randomUUID();
    const graph = this.graphRegistry.get(graphId);

    const initialData: Record<string, unknown> = { ...input };
    if (options?.messages !== undefined) {
      initialData["messages"] = options.messages;
    }

    const runtime: GraphRuntimeContext = {
      llmProvider: options?.llmProvider,
      tools: options?.tools,
      systemPrompt: options?.systemPrompt,
      pluginManager: options?.pluginManager,
    };
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

    await this.checkpointer.saveSnapshot(runId, blackboard.getSnapshot());

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

  resume = async (runId: RunId): Promise<void> => {
    const context = this.pausedRuns.get(runId);
    if (!context) {
      throw new Error(`Run not paused: ${runId}`);
    }

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
    void this.dispatchNode(runId, nodeId).catch(async (error: unknown) => {
      await this.handleDispatchFailure(runId, nodeId, error);
    });
  };

  private handleDispatchFailure = async (
    runId: RunId,
    nodeId: NodeId,
    error: unknown,
  ): Promise<void> => {
    await this.eventBus.publish(
      createAgentEvent({
        runId,
        nodeId,
        type: "run:error",
        timestamp: new Date().toISOString(),
        payload: {
          error: error instanceof Error ? error.message : String(error),
        },
      }),
    );

    await this.completeRun(runId, "failed");
  };

  recover = async (
    runId: RunId,
    options?: SchedulerRecoverOptions,
  ): Promise<void> => {
    const existingContext =
      this.activeRuns.get(runId) ?? this.pausedRuns.get(runId) ?? null;
    if (existingContext) {
      if (options?.runtime) {
        existingContext.runtime = options.runtime;
      }
      return;
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
    const blackboard = await Blackboard.fromSnapshot(snapshot);

    const context: RunContext = {
      runId,
      graph,
      blackboard,
      runtime: options?.runtime ?? {},
      deduplicationKey: metadata.deduplicationKey,
      metadata: metadata.metadata,
      status: metadata.status,
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
  };

  dispose = async (): Promise<void> => {
    this.stopReclaimLoop();
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

  private reclaimExpiredLeases = async (): Promise<void> => {
    const expired = await this.leaseManager.findExpired();
    for (const lease of expired) {
      // oxlint-disable-next-line no-await-in-loop
      await this.reclaimLease(lease);
    }
  };

  private reclaimLease = async (lease: LeaseRecord): Promise<void> => {
    const context = this.activeRuns.get(lease.runId);
    if (!context || context.status !== "running") return;
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

    setTimeout(() => {
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
    if (!context || context.status !== "running") return;

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
    if (!context || context.status !== "running") return;

    const nodeDef = context.graph.nodes[nodeId];
    if (!nodeDef) {
      throw new Error(`Node not found in graph: ${nodeId}`);
    }

    context.currentNodeIds.add(nodeId);

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
      setTimeout(() => {
        void this.pause(event.runId, event.nodeId);
      }, 0);
      return;
    }

    const nextNodes = this.evaluateNextNodes(context, event.nodeId);
    if (nextNodes.length === 0 && context.currentNodeIds.size === 0) {
      setTimeout(() => {
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

  handleToolConfirmResponse = async (event: AgentEvent): Promise<void> => {
    const context = this.pausedRuns.get(event.runId);
    if (!context) return;

    const payload = toRecord(event.payload);
    const nodeId = payload.nodeId;
    const callId = payload.callId;
    const decision = payload.decision;

    if (typeof nodeId !== "string") {
      await this.resume(event.runId);
      return;
    }

    if (typeof callId === "string" && typeof decision === "string") {
      const confirmPatch = buildPatch({
        actorId: nodeId,
        parentSnapshotVersion: context.blackboard.getSnapshot().version,
        updates: {
          [`__toolConfirm.${nodeId}`]: {
            callId,
            decision,
            timestamp: event.timestamp,
          },
        },
      });

      const patchResult = context.blackboard.applyPatch(confirmPatch);
      if (!patchResult.ok) {
        await this.eventBus.publish(
          createAgentEvent({
            runId: event.runId,
            nodeId,
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

      await this.checkpointer.saveSnapshot(
        event.runId,
        context.blackboard.getSnapshot(),
      );
    }

    context.pendingNodeIds.delete(nodeId);
    await this.resume(event.runId);
    this.enqueuePendingNode(context, nodeId);
    this.drainPendingNodes(event.runId);
  };

  private onRunPause = async (_event: AgentEvent): Promise<void> => {
    return;
  };

  private onRunResume = async (_event: AgentEvent): Promise<void> => {
    return;
  };

  private onRunCancel = async (event: AgentEvent): Promise<void> => {
    await this.completeRun(event.runId, "cancelled");
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
        return this.evaluateCondition(
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

  private evaluateCondition = (
    condition: EdgeCondition,
    data: unknown,
  ): boolean => {
    if (condition.type === "blackboard_field") {
      const [pathRaw, expectedRaw] = condition.value.split("==");
      if (!pathRaw || expectedRaw === undefined) return false;
      const actual = resolvePath(data, pathRaw.trim());
      const expected = parseExpectedValue(expectedRaw.trim());
      return actual === expected;
    }

    if (condition.type === "schema_match") {
      const value = resolvePath(data, condition.value);
      return value !== undefined && value !== null;
    }

    if (condition.type === "expression") {
      const normalized = condition.value.trim();
      if (normalized === "true") return true;
      if (normalized === "false") return false;

      const [pathRaw, expectedRaw] = normalized.split("==");
      if (!pathRaw || expectedRaw === undefined) return false;
      const actual = resolvePath(data, pathRaw.trim());
      const expected = parseExpectedValue(expectedRaw.trim());
      return actual === expected;
    }

    return false;
  };

  private completeRun = async (
    runId: RunId,
    status: RunStatus,
  ): Promise<void> => {
    const context = this.activeRuns.get(runId) ?? this.pausedRuns.get(runId);
    if (!context) return;

    this.activeRuns.delete(runId);
    this.pausedRuns.delete(runId);

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
      deduplicationKey: context.deduplicationKey,
      startedAt: context.blackboard.getSnapshot().createdAt,
      completedAt: new Date().toISOString(),
      graphDefinition: context.graph,
      metadata: withPendingNodeIds(context.metadata, context.pendingNodeIds),
    });

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

  hasPausedRun = (runId: RunId): boolean => {
    return this.pausedRuns.has(runId);
  };

  hasRun = (runId: RunId): boolean => {
    return this.activeRuns.has(runId) || this.pausedRuns.has(runId);
  };
}
