import * as crypto from "node:crypto";

import type { Checkpointer } from "@/graph/checkpointer";
import type { EventBus } from "@/graph/event-bus";
import type { AgentEvent } from "@/graph/events";
import type { ExecutorPool } from "@/graph/executor-pool";
import type { GraphRegistry } from "@/graph/graph-registry";
import type { NodeRegistry } from "@/graph/node-registry";
import type {
  EdgeCondition,
  GraphDefinition,
  NodeId,
  RunId,
  RunStatus,
} from "@/graph/types";

import { Blackboard, buildPatch } from "@/graph/blackboard";
import { PatchSchema } from "@/graph/types";

type RunContext = {
  runId: RunId;
  graph: GraphDefinition;
  blackboard: Blackboard;
  status: RunStatus;
  currentNodeIds: Set<NodeId>;
  completedNodes: Set<NodeId>;
};

export type SchedulerOptions = {
  eventBus: EventBus;
  checkpointer: Checkpointer;
  executorPool: ExecutorPool;
  graphRegistry: GraphRegistry;
  nodeRegistry: NodeRegistry;
};

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

export class Scheduler {
  private eventBus: EventBus;

  private checkpointer: Checkpointer;

  private executorPool: ExecutorPool;

  private graphRegistry: GraphRegistry;

  private nodeRegistry: NodeRegistry;

  private activeRuns = new Map<RunId, RunContext>();

  private pausedRuns = new Map<RunId, RunContext>();

  constructor(options: SchedulerOptions) {
    this.eventBus = options.eventBus;
    this.checkpointer = options.checkpointer;
    this.executorPool = options.executorPool;
    this.graphRegistry = options.graphRegistry;
    this.nodeRegistry = options.nodeRegistry;

    this.setupEventHandlers();
  }

  private setupEventHandlers = (): void => {
    this.eventBus.subscribe("node:end", this.onNodeEnd);
    this.eventBus.subscribe("node:error", this.onNodeError);
    this.eventBus.subscribe("human:input:received", this.onHumanInputReceived);
    this.eventBus.subscribe(
      "tool:confirm:response",
      this.onToolConfirmResponse,
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
  ): Promise<RunId> => {
    const runId = crypto.randomUUID();
    const graph = this.graphRegistry.get(graphId);
    const blackboard = new Blackboard({ runId, initialData: input });

    const context: RunContext = {
      runId,
      graph,
      blackboard,
      status: "running",
      currentNodeIds: new Set<NodeId>(),
      completedNodes: new Set<NodeId>(),
    };

    this.activeRuns.set(runId, context);

    await this.checkpointer.saveRunMetadata(runId, {
      graphId,
      status: "running",
      startedAt: new Date().toISOString(),
      graphDefinition: graph,
    });

    await this.checkpointer.saveSnapshot(runId, blackboard.getSnapshot());

    await this.eventBus.publish({
      runId,
      type: "run:start",
      timestamp: new Date().toISOString(),
      payload: { graphId, input },
    });

    await this.dispatchNode(runId, graph.entry);

    return runId;
  };

  pause = async (runId: RunId): Promise<void> => {
    const context = this.activeRuns.get(runId);
    if (!context) {
      throw new Error(`Run not active: ${runId}`);
    }

    context.status = "paused";
    this.activeRuns.delete(runId);
    this.pausedRuns.set(runId, context);

    await this.checkpointer.saveRunMetadata(runId, {
      graphId: context.graph.id,
      status: "paused",
      startedAt: context.blackboard.getSnapshot().createdAt,
      graphDefinition: context.graph,
    });

    await this.eventBus.publish({
      runId,
      type: "run:pause",
      timestamp: new Date().toISOString(),
      payload: {},
    });
  };

  resume = async (runId: RunId): Promise<void> => {
    const context = this.pausedRuns.get(runId);
    if (!context) {
      throw new Error(`Run not paused: ${runId}`);
    }

    context.status = "running";
    this.pausedRuns.delete(runId);
    this.activeRuns.set(runId, context);

    await this.checkpointer.saveRunMetadata(runId, {
      graphId: context.graph.id,
      status: "running",
      startedAt: context.blackboard.getSnapshot().createdAt,
      graphDefinition: context.graph,
    });

    await this.eventBus.publish({
      runId,
      type: "run:resume",
      timestamp: new Date().toISOString(),
      payload: {},
    });

    if (context.currentNodeIds.size === 0) {
      await this.dispatchNode(runId, context.graph.entry);
    }
  };

  recover = async (runId: RunId): Promise<void> => {
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
      status: metadata.status,
      currentNodeIds: new Set<NodeId>(),
      completedNodes: new Set<NodeId>(),
    };

    if (metadata.status === "paused") {
      this.pausedRuns.set(runId, context);
      return;
    }

    this.activeRuns.set(runId, context);
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

    await this.eventBus.publish({
      runId,
      nodeId,
      type: "node:start",
      timestamp: new Date().toISOString(),
      payload: {
        nodeType: nodeDef.type,
        config: nodeDef.config ?? null,
      },
    });

    const executor = this.nodeRegistry.getExecutor(nodeDef.type);
    const idempotencyKey = this.computeIdempotencyKey(
      nodeId,
      context.blackboard.getSnapshot().version,
    );

    await this.executorPool.submit({
      runId,
      nodeId,
      nodeDef,
      executor,
      config: toConfigObject(nodeDef.config),
      snapshot: context.blackboard.getSnapshot(),
      eventBus: this.eventBus,
      checkpointer: this.checkpointer,
      idempotencyKey,
      retry: nodeDef.retry,
    });
  };

  private computeIdempotencyKey = (nodeId: string, version: number): string => {
    return `${nodeId}:${version}`;
  };

  private onNodeEnd = async (event: AgentEvent): Promise<void> => {
    if (!event.nodeId) return;

    const context = this.activeRuns.get(event.runId);
    if (!context) return;

    const payload = toRecord(event.payload);
    const patchCandidate = payload["patch"];
    const parsedPatch = PatchSchema.safeParse(patchCandidate);
    const patchLike = parsedPatch.success ? parsedPatch.data : null;

    if (patchLike) {
      const patchResult = context.blackboard.applyPatch(patchLike);
      if (!patchResult.ok) {
        await this.eventBus.publish({
          runId: event.runId,
          nodeId: event.nodeId,
          type: "run:error",
          timestamp: new Date().toISOString(),
          payload: {
            error: patchResult.error,
          },
        });
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
      await this.pause(event.runId);
      return;
    }

    const nextNodes = this.evaluateNextNodes(context, event.nodeId);
    if (nextNodes.length === 0 && context.currentNodeIds.size === 0) {
      await this.completeRun(event.runId, "completed");
      return;
    }

    await Promise.all(
      nextNodes.map(async (nextNodeId) =>
        this.dispatchNode(event.runId, nextNodeId),
      ),
    );
  };

  private onNodeError = async (event: AgentEvent): Promise<void> => {
    await this.eventBus.publish({
      runId: event.runId,
      nodeId: event.nodeId,
      type: "run:error",
      timestamp: new Date().toISOString(),
      payload: event.payload,
    });
    await this.completeRun(event.runId, "failed");
  };

  private onHumanInputReceived = async (event: AgentEvent): Promise<void> => {
    const context = this.pausedRuns.get(event.runId);
    if (!context) return;

    const payload = toRecord(event.payload);
    const nodeId = payload.nodeId;

    if (typeof nodeId !== "string") {
      await this.resume(event.runId);
      return;
    }

    await this.resume(event.runId);
    await this.dispatchNode(event.runId, nodeId);
  };

  private onToolConfirmResponse = async (event: AgentEvent): Promise<void> => {
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
        await this.eventBus.publish({
          runId: event.runId,
          nodeId,
          type: "run:error",
          timestamp: new Date().toISOString(),
          payload: {
            error: patchResult.error,
          },
        });
        await this.completeRun(event.runId, "failed");
        return;
      }

      await this.checkpointer.saveSnapshot(
        event.runId,
        context.blackboard.getSnapshot(),
      );
    }

    await this.resume(event.runId);
    await this.dispatchNode(event.runId, nodeId);
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

    await this.checkpointer.saveRunMetadata(runId, {
      graphId: context.graph.id,
      status,
      startedAt: context.blackboard.getSnapshot().createdAt,
      completedAt: new Date().toISOString(),
      graphDefinition: context.graph,
    });

    await this.eventBus.publish({
      runId,
      type: "run:end",
      timestamp: new Date().toISOString(),
      payload: {
        status,
        blackboard: context.blackboard.getSnapshot().data,
      },
    });
  };
}
