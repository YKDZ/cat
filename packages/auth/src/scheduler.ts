import type { EventBus } from "@cat/core";

import { evaluateCondition } from "@cat/graph";

import type { AuthFlowRegistry } from "./flow-registry.ts";
import type { AuthNodeRegistry } from "./node-registry.ts";
import type { AuthEvent, AuthEventType } from "./observability.ts";
import type {
  AuthBlackboardData,
  AuthFlowDefinition,
  AuthNodeDefinition,
  AuthNodeExecutorContext,
  FlowState,
} from "./types.ts";

import {
  applyBlackboardUpdate,
  createAuthBlackboard,
  type AuthBlackboardSnapshot,
} from "./blackboard.ts";

// ====== FlowStorage interface ======

export interface FlowStorage {
  save(
    flowId: string,
    snapshot: AuthBlackboardSnapshot,
    ttlSeconds: number,
  ): Promise<void>;
  load(flowId: string): Promise<AuthBlackboardSnapshot | null>;
  delete(flowId: string): Promise<void>;
}

// ====== Scheduler dependencies ======

export interface SchedulerDeps {
  flowRegistry: AuthFlowRegistry;
  nodeRegistry: AuthNodeRegistry;
  storage: FlowStorage;
  eventBus?: EventBus<AuthEventType, AuthEvent>;
  services: {
    sessionStore: unknown;
    cacheStore: unknown;
    db: unknown;
    pluginManager: unknown;
  };
}

export interface HttpContext {
  ip: string;
  userAgent: string;
  csrfToken: string;
  cookies: Record<string, string>;
}

export interface InitFlowArgs {
  flowId?: string;
  flowDefId: string;
  version?: string;
  httpContext: HttpContext;
}

export interface AdvanceFlowArgs {
  flowId: string;
  input?: Record<string, unknown>;
  httpContext: HttpContext;
}

// ====== Internal helpers ======

const resolveNextNode = (
  flowDef: AuthFlowDefinition,
  currentNode: string,
  blackboard: AuthBlackboardData,
): string | null => {
  const outEdges = flowDef.edges.filter((e) => e.from === currentNode);
  if (outEdges.length === 0) return null;
  for (const edge of outEdges) {
    if (!edge.condition) continue;
    if (evaluateCondition(edge.condition, blackboard)) return edge.to;
  }
  const defaultEdge = outEdges.find((e) => !e.condition);
  return defaultEdge?.to ?? null;
};

const isTerminal = (
  flowDef: AuthFlowDefinition,
  nodeId: string,
): { terminal: boolean; kind: "success" | "failure" | null } => {
  if (flowDef.terminalNodes.success.includes(nodeId)) {
    return { terminal: true, kind: "success" };
  }
  if (flowDef.terminalNodes.failure.includes(nodeId)) {
    return { terminal: true, kind: "failure" };
  }
  return { terminal: false, kind: null };
};

const buildFlowState = (
  snapshot: AuthBlackboardSnapshot,
  flowDef: AuthFlowDefinition,
  error?: { code: string; message: string; retriesRemaining?: number },
): FlowState => {
  const { data } = snapshot;
  const currentNodeDef: AuthNodeDefinition | undefined =
    flowDef.nodes[data.currentNode];

  return {
    flowId: snapshot.flowId,
    status: data.status,
    currentNode:
      currentNodeDef &&
      data.status !== "completed" &&
      data.status !== "failed" &&
      data.status !== "expired"
        ? { nodeId: data.currentNode, hint: currentNodeDef.clientHint }
        : null,
    progress: {
      completedSteps: data.completedNodes.length,
      totalEstimatedSteps: Object.keys(flowDef.nodes).length,
    },
    error,
  };
};

// ====== Scheduler ======

export class AuthFlowScheduler {
  constructor(private readonly deps: SchedulerDeps) {}

  async initFlow(args: InitFlowArgs): Promise<FlowState> {
    const { flowRegistry, storage, eventBus } = this.deps;

    const flowDef = flowRegistry.get(args.flowDefId, args.version);
    if (!flowDef) {
      throw new Error(
        `Auth flow "${args.flowDefId}" (version: ${args.version ?? "latest"}) not found`,
      );
    }

    const flowTTL = flowDef.config?.flowTTLSeconds ?? 600;
    const flowId = args.flowId ?? crypto.randomUUID();

    const ipHash = await hashIp(args.httpContext.ip);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + flowTTL * 1000).toISOString();

    const snapshot = createAuthBlackboard({
      flowId,
      flowDefId: args.flowDefId,
      entryNode: flowDef.entry,
      security: {
        csrfToken: args.httpContext.csrfToken,
        ipHash,
        startedAt: now.toISOString(),
        expiresAt,
        stepNonces: {},
      },
    });

    await storage.save(flowId, snapshot, flowTTL);

    await eventBus?.publish({
      eventId: crypto.randomUUID(),
      type: "auth:flow:start",
      payload: { flowId, flowDefId: args.flowDefId },
      timestamp: new Date().toISOString(),
    });

    // Auto-advance if entry node requires no user input
    const advanced = await this.autoAdvance(
      flowId,
      snapshot,
      flowDef,
      args.httpContext,
    );
    return buildFlowState(advanced, flowDef);
  }

  async advanceFlow(args: AdvanceFlowArgs): Promise<FlowState> {
    const { flowRegistry, nodeRegistry, storage, eventBus, services } =
      this.deps;

    const snapshot = await storage.load(args.flowId);
    if (!snapshot) {
      throw new Error(`Auth flow "${args.flowId}" not found or expired`);
    }

    // Security checks
    const now = new Date();
    if (new Date(snapshot.security.expiresAt) < now) {
      await this.updateStatus(snapshot, "expired", storage, flowRegistry);
      throw new Error("Auth flow has expired");
    }

    const flowDef = flowRegistry.get(snapshot.data.flowDefId);
    if (!flowDef) {
      throw new Error(
        `Auth flow definition "${snapshot.data.flowDefId}" not found`,
      );
    }

    const ipHash = await hashIp(args.httpContext.ip);
    if (ipHash !== snapshot.security.ipHash) {
      await eventBus?.publish({
        eventId: crypto.randomUUID(),
        type: "auth:security:ip_change",
        payload: {
          flowId: args.flowId,
          oldIpHash: snapshot.security.ipHash,
          newIpHash: ipHash,
        },
        timestamp: now.toISOString(),
      });
      throw new Error("IP address changed during auth flow");
    }

    if (
      flowDef.config?.requireCSRF &&
      args.httpContext.csrfToken !== snapshot.security.csrfToken
    ) {
      throw new Error("CSRF token mismatch");
    }

    const { data } = snapshot;
    const nodeDef = flowDef.nodes[data.currentNode];
    if (!nodeDef) {
      throw new Error(
        `Node "${data.currentNode}" not found in flow definition`,
      );
    }

    const executor = nodeRegistry.resolve(nodeDef.type, nodeDef.factorId);
    if (!executor) {
      throw new Error(
        `No executor registered for node type "${nodeDef.type}" (factorId: ${nodeDef.factorId ?? "none"})`,
      );
    }

    await eventBus?.publish({
      eventId: crypto.randomUUID(),
      type: "auth:node:start",
      payload: {
        flowId: args.flowId,
        nodeId: data.currentNode,
        nodeType: nodeDef.type,
      },
      timestamp: now.toISOString(),
    });

    const ctx: AuthNodeExecutorContext = {
      flowId: args.flowId,
      nodeId: data.currentNode,
      blackboard: data,
      input: args.input,
      httpContext: args.httpContext,
      services,
    };

    let result;
    try {
      result = await executor(ctx, nodeDef);
    } catch (err) {
      await eventBus?.publish({
        eventId: crypto.randomUUID(),
        type: "auth:node:error",
        payload: {
          flowId: args.flowId,
          nodeId: data.currentNode,
          error: err instanceof Error ? err.message : String(err),
        },
        timestamp: new Date().toISOString(),
      });
      throw err;
    }

    await eventBus?.publish({
      eventId: crypto.randomUUID(),
      type: "auth:node:end",
      payload: {
        flowId: args.flowId,
        nodeId: data.currentNode,
        status: result.status,
      },
      timestamp: new Date().toISOString(),
    });

    if (result.status === "wait_input") {
      const updatedSnapshot = applyBlackboardUpdate(snapshot, {
        status: "in_progress",
        ...result.updates,
      });
      await storage.save(
        args.flowId,
        updatedSnapshot,
        flowDef.config?.flowTTLSeconds ?? 600,
      );
      return buildFlowState(
        updatedSnapshot,
        flowDef,
        result.error
          ? {
              code: result.error.code,
              message: result.error.message,
              retriesRemaining: nodeDef.retry?.maxAttempts,
            }
          : undefined,
      );
    }

    if (result.status === "failed") {
      const updatedSnapshot = applyBlackboardUpdate(snapshot, {
        status: "failed",
        ...result.updates,
      });
      await storage.save(
        args.flowId,
        updatedSnapshot,
        flowDef.config?.flowTTLSeconds ?? 600,
      );
      return buildFlowState(updatedSnapshot, flowDef, result.error);
    }

    // status === "advance" or "completed"
    const withNodeOutput = applyBlackboardUpdate(snapshot, {
      status: "in_progress",
      completedNodes: [...data.completedNodes, data.currentNode],
      ...result.updates,
    });

    const nextNode = resolveNextNode(
      flowDef,
      data.currentNode,
      withNodeOutput.data,
    );
    if (!nextNode) {
      const completedSnapshot = applyBlackboardUpdate(withNodeOutput, {
        status: "completed",
      });
      await storage.save(
        args.flowId,
        completedSnapshot,
        flowDef.config?.flowTTLSeconds ?? 600,
      );
      await eventBus?.publish({
        eventId: crypto.randomUUID(),
        type: "auth:flow:end",
        payload: { flowId: args.flowId, status: "completed" },
        timestamp: new Date().toISOString(),
      });
      return buildFlowState(completedSnapshot, flowDef);
    }

    const { terminal, kind } = isTerminal(flowDef, nextNode);
    const movedSnapshot = applyBlackboardUpdate(withNodeOutput, {
      currentNode: nextNode,
      status: terminal
        ? kind === "success"
          ? "completed"
          : "failed"
        : "in_progress",
    });
    await storage.save(
      args.flowId,
      movedSnapshot,
      flowDef.config?.flowTTLSeconds ?? 600,
    );

    if (terminal) {
      await eventBus?.publish({
        eventId: crypto.randomUUID(),
        type: "auth:flow:end",
        payload: { flowId: args.flowId, status: kind ?? "completed" },
        timestamp: new Date().toISOString(),
      });
      return buildFlowState(movedSnapshot, flowDef);
    }

    // Auto-advance if next node needs no user input
    const finalSnapshot = await this.autoAdvance(
      args.flowId,
      movedSnapshot,
      flowDef,
      args.httpContext,
    );
    return buildFlowState(finalSnapshot, flowDef);
  }

  async getFlowState(flowId: string): Promise<FlowState | null> {
    const { storage, flowRegistry } = this.deps;
    const snapshot = await storage.load(flowId);
    if (!snapshot) return null;
    const flowDef = flowRegistry.get(snapshot.data.flowDefId);
    if (!flowDef) return null;
    return buildFlowState(snapshot, flowDef);
  }

  async cancelFlow(flowId: string): Promise<void> {
    const { storage, flowRegistry, eventBus } = this.deps;
    const snapshot = await storage.load(flowId);
    if (!snapshot) return;
    const flowDef = flowRegistry.get(snapshot.data.flowDefId);
    if (flowDef) {
      await this.updateStatus(snapshot, "failed", storage, flowRegistry);
    }
    await storage.delete(flowId);
    await eventBus?.publish({
      eventId: crypto.randomUUID(),
      type: "auth:flow:end",
      payload: { flowId, status: "cancelled" },
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * 对 componentType 为 "none" 的无交互节点自动推进，直到需要用户输入或到达终止节点。
   * 防止无限循环：最多推进 maxSteps 次。
   */
  private async autoAdvance(
    flowId: string,
    snapshot: AuthBlackboardSnapshot,
    flowDef: AuthFlowDefinition,
    httpContext: HttpContext,
  ): Promise<AuthBlackboardSnapshot> {
    const maxSteps = flowDef.config?.maxSteps ?? 20;
    let current = snapshot;

    for (let i = 0; i < maxSteps; i += 1) {
      const nodeDef = flowDef.nodes[current.data.currentNode];
      if (!nodeDef) break;

      // 需要用户交互，停止自动推进
      if (nodeDef.clientHint.componentType !== "none") break;

      // 终止节点，停止自动推进
      if (isTerminal(flowDef, current.data.currentNode).terminal) break;

      // 继续推进
      // oxlint-disable-next-line no-await-in-loop
      const nextState = await this.advanceFlow({
        flowId,
        httpContext,
      });

      // oxlint-disable-next-line no-await-in-loop
      const nextSnapshot = await this.deps.storage.load(flowId);
      if (!nextSnapshot) break;
      current = nextSnapshot;

      // 到达终止状态或需要用户输入则退出
      const status = nextState.status;
      if (
        status === "completed" ||
        status === "failed" ||
        status === "expired"
      ) {
        break;
      }
      if (nextState.currentNode?.hint.componentType !== "none") break;
    }

    return current;
  }

  private async updateStatus(
    snapshot: AuthBlackboardSnapshot,
    status: AuthBlackboardData["status"],
    storage: FlowStorage,
    flowRegistry: AuthFlowRegistry,
  ): Promise<void> {
    const updated = applyBlackboardUpdate(snapshot, { status });
    const flowDef = flowRegistry.get(snapshot.data.flowDefId);
    const ttl = flowDef?.config?.flowTTLSeconds ?? 600;
    await storage.save(snapshot.flowId, updated, ttl);
  }
}

// ====== IP hashing (SHA-256, first 16 hex chars) ======

const hashIp = async (ip: string): Promise<string> => {
  const encoder = new TextEncoder();
  const data = encoder.encode(ip);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 32);
};
