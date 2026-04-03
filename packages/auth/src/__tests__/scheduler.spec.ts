import { describe, expect, it } from "vitest";

import type { AuthBlackboardSnapshot } from "../blackboard.ts";
import type { AuthNodeExecutor } from "../types.ts";

import { AuthFlowRegistry } from "../flow-registry.ts";
import { standardLoginFlow } from "../flows/standard-login.ts";
import { AuthNodeRegistry } from "../node-registry.ts";
import { AuthFlowScheduler, type FlowStorage } from "../scheduler.ts";

// ====== In-memory FlowStorage for tests ======

class InMemoryFlowStorage implements FlowStorage {
  private store = new Map<string, AuthBlackboardSnapshot>();

  async save(flowId: string, snapshot: AuthBlackboardSnapshot): Promise<void> {
    this.store.set(flowId, snapshot);
  }

  async load(flowId: string): Promise<AuthBlackboardSnapshot | null> {
    return this.store.get(flowId) ?? null;
  }

  async delete(flowId: string): Promise<void> {
    this.store.delete(flowId);
  }

  getSnapshot(flowId: string): AuthBlackboardSnapshot | undefined {
    return this.store.get(flowId);
  }
}

const makeHttpContext = () => ({
  ip: "127.0.0.1",
  userAgent: "test-agent",
  csrfToken: "test-csrf",
  cookies: {},
});

const waitInputExecutor: AuthNodeExecutor = async (_ctx, nodeDef) => ({
  updates: {},
  status: "wait_input",
  clientHint: nodeDef.clientHint,
});

const advanceExecutor: AuthNodeExecutor = async (_ctx, nodeDef) => ({
  updates: { [`nodeOutputs.${nodeDef.id}`]: { ok: true } },
  status: "advance",
});

const makeServices = () => ({
  sessionStore: null,
  cacheStore: null,
  db: null,
  pluginManager: null,
});

describe("AuthFlowScheduler.initFlow", () => {
  it("creates a new flow and returns in_progress state", async () => {
    const flowRegistry = new AuthFlowRegistry();
    flowRegistry.register(standardLoginFlow);

    const nodeRegistry = new AuthNodeRegistry();
    // collect-identifier needs user input
    nodeRegistry.register("credential_collector", waitInputExecutor);
    nodeRegistry.register("identity_resolver", advanceExecutor);
    nodeRegistry.register("decision_router", advanceExecutor);
    nodeRegistry.register("session_finalizer", advanceExecutor);
    nodeRegistry.register("challenge_verifier", waitInputExecutor);

    const storage = new InMemoryFlowStorage();

    const scheduler = new AuthFlowScheduler({
      flowRegistry,
      nodeRegistry,
      storage,
      services: makeServices(),
    });

    const state = await scheduler.initFlow({
      flowDefId: "standard-login",
      httpContext: makeHttpContext(),
    });

    expect(state.flowId).toBeTruthy();
    // entry node is collect-identifier (credential_collector), needs input → in_progress
    expect(["pending", "in_progress"]).toContain(state.status);
    expect(state.currentNode?.nodeId).toBe("collect-identifier");
  });

  it("stores snapshot in storage", async () => {
    const flowRegistry = new AuthFlowRegistry();
    flowRegistry.register(standardLoginFlow);

    const nodeRegistry = new AuthNodeRegistry();
    nodeRegistry.register("credential_collector", waitInputExecutor);
    nodeRegistry.register("identity_resolver", advanceExecutor);
    nodeRegistry.register("decision_router", advanceExecutor);
    nodeRegistry.register("session_finalizer", advanceExecutor);
    nodeRegistry.register("challenge_verifier", waitInputExecutor);

    const storage = new InMemoryFlowStorage();

    const scheduler = new AuthFlowScheduler({
      flowRegistry,
      nodeRegistry,
      storage,
      services: makeServices(),
    });

    const state = await scheduler.initFlow({
      flowDefId: "standard-login",
      httpContext: makeHttpContext(),
    });

    const snapshot = await storage.load(state.flowId);
    expect(snapshot).not.toBeNull();
    expect(snapshot?.flowId).toBe(state.flowId);
  });

  it("throws if flowDefId not found", async () => {
    const flowRegistry = new AuthFlowRegistry();
    const nodeRegistry = new AuthNodeRegistry();
    const storage = new InMemoryFlowStorage();
    const scheduler = new AuthFlowScheduler({
      flowRegistry,
      nodeRegistry,
      storage,
      services: makeServices(),
    });
    await expect(
      scheduler.initFlow({
        flowDefId: "unknown-flow",
        httpContext: makeHttpContext(),
      }),
    ).rejects.toThrow("not found");
  });
});

describe("AuthFlowScheduler.advanceFlow", () => {
  it("auto-advances through none-componentType nodes at initFlow", async () => {
    // Build a tiny flow: none-entry → wait-input-second
    const tinyFlow = {
      id: "tiny-flow",
      version: "1.0.0",
      nodes: {
        "auto-step": {
          id: "auto-step",
          type: "decision_router" as const,
          clientHint: { componentType: "none" as const },
        },
        "manual-step": {
          id: "manual-step",
          type: "credential_collector" as const,
          clientHint: { componentType: "identifier_input" as const },
        },
        end: {
          id: "end",
          type: "session_finalizer" as const,
          clientHint: { componentType: "none" as const },
        },
      },
      edges: [
        { from: "auto-step", to: "manual-step" },
        { from: "manual-step", to: "end" },
      ],
      entry: "auto-step",
      terminalNodes: { success: ["end"], failure: [] },
      config: { maxSteps: 20, flowTTLSeconds: 600, requireCSRF: false },
    };

    const flowRegistry = new AuthFlowRegistry();
    flowRegistry.register(tinyFlow, false); // skip DAG validation for test flow

    const nodeRegistry = new AuthNodeRegistry();
    // auto-step has componentType "none" → should be auto-advanced
    nodeRegistry.register("decision_router", advanceExecutor);
    // manual-step requires input → should stop here
    nodeRegistry.register("credential_collector", waitInputExecutor);
    nodeRegistry.register("session_finalizer", advanceExecutor);

    const storage = new InMemoryFlowStorage();
    const scheduler = new AuthFlowScheduler({
      flowRegistry,
      nodeRegistry,
      storage,
      services: makeServices(),
    });

    const initState = await scheduler.initFlow({
      flowDefId: "tiny-flow",
      httpContext: makeHttpContext(),
    });

    // auto-step (none) was auto-advanced; manual-step (identifier_input) stops
    expect(initState.currentNode?.nodeId).toBe("manual-step");
  });

  it("returns wait_input when executor returns wait_input", async () => {
    const flowRegistry = new AuthFlowRegistry();
    flowRegistry.register(standardLoginFlow);

    const nodeRegistry = new AuthNodeRegistry();
    nodeRegistry.register("credential_collector", waitInputExecutor);
    nodeRegistry.register("identity_resolver", advanceExecutor);
    nodeRegistry.register("decision_router", advanceExecutor);
    nodeRegistry.register("session_finalizer", advanceExecutor);
    nodeRegistry.register("challenge_verifier", waitInputExecutor);

    const storage = new InMemoryFlowStorage();
    const scheduler = new AuthFlowScheduler({
      flowRegistry,
      nodeRegistry,
      storage,
      services: makeServices(),
    });

    const initState = await scheduler.initFlow({
      flowDefId: "standard-login",
      httpContext: makeHttpContext(),
    });

    // collect-identifier need user input
    expect(initState.currentNode?.nodeId).toBe("collect-identifier");

    const advanced = await scheduler.advanceFlow({
      flowId: initState.flowId,
      input: { email: "user@example.com" },
      httpContext: makeHttpContext(),
    });
    // After advancing past collect-identifier (wait_input→ provides input), should move to resolve-identity
    expect(["in_progress", "completed"]).toContain(advanced.status);
  });

  it("throws if flow not found", async () => {
    const flowRegistry = new AuthFlowRegistry();
    const nodeRegistry = new AuthNodeRegistry();
    const storage = new InMemoryFlowStorage();
    const scheduler = new AuthFlowScheduler({
      flowRegistry,
      nodeRegistry,
      storage,
      services: makeServices(),
    });
    await expect(
      scheduler.advanceFlow({
        flowId: "non-existent",
        httpContext: makeHttpContext(),
      }),
    ).rejects.toThrow("not found");
  });

  it("throws on IP mismatch", async () => {
    const flowRegistry = new AuthFlowRegistry();
    flowRegistry.register(standardLoginFlow);

    const nodeRegistry = new AuthNodeRegistry();
    nodeRegistry.register("credential_collector", waitInputExecutor);
    nodeRegistry.register("identity_resolver", advanceExecutor);
    nodeRegistry.register("decision_router", advanceExecutor);
    nodeRegistry.register("session_finalizer", advanceExecutor);
    nodeRegistry.register("challenge_verifier", waitInputExecutor);

    const storage = new InMemoryFlowStorage();
    const scheduler = new AuthFlowScheduler({
      flowRegistry,
      nodeRegistry,
      storage,
      services: makeServices(),
    });

    const initState = await scheduler.initFlow({
      flowDefId: "standard-login",
      httpContext: makeHttpContext(),
    });

    await expect(
      scheduler.advanceFlow({
        flowId: initState.flowId,
        httpContext: { ...makeHttpContext(), ip: "10.0.0.1" }, // different IP
      }),
    ).rejects.toThrow("IP address changed");
  });
});

describe("AuthFlowScheduler.getFlowState", () => {
  it("returns null for missing flow", async () => {
    const flowRegistry = new AuthFlowRegistry();
    const nodeRegistry = new AuthNodeRegistry();
    const storage = new InMemoryFlowStorage();
    const scheduler = new AuthFlowScheduler({
      flowRegistry,
      nodeRegistry,
      storage,
      services: makeServices(),
    });
    const state = await scheduler.getFlowState("missing");
    expect(state).toBeNull();
  });

  it("returns state for existing flow", async () => {
    const flowRegistry = new AuthFlowRegistry();
    flowRegistry.register(standardLoginFlow);

    const nodeRegistry = new AuthNodeRegistry();
    nodeRegistry.register("credential_collector", waitInputExecutor);
    nodeRegistry.register("identity_resolver", advanceExecutor);
    nodeRegistry.register("decision_router", advanceExecutor);
    nodeRegistry.register("session_finalizer", advanceExecutor);
    nodeRegistry.register("challenge_verifier", waitInputExecutor);

    const storage = new InMemoryFlowStorage();
    const scheduler = new AuthFlowScheduler({
      flowRegistry,
      nodeRegistry,
      storage,
      services: makeServices(),
    });

    const initState = await scheduler.initFlow({
      flowDefId: "standard-login",
      httpContext: makeHttpContext(),
    });

    const state = await scheduler.getFlowState(initState.flowId);
    expect(state).not.toBeNull();
    expect(state?.flowId).toBe(initState.flowId);
  });
});

describe("AuthFlowScheduler.cancelFlow", () => {
  it("deletes the flow from storage", async () => {
    const flowRegistry = new AuthFlowRegistry();
    flowRegistry.register(standardLoginFlow);

    const nodeRegistry = new AuthNodeRegistry();
    nodeRegistry.register("credential_collector", waitInputExecutor);
    nodeRegistry.register("identity_resolver", advanceExecutor);
    nodeRegistry.register("decision_router", advanceExecutor);
    nodeRegistry.register("session_finalizer", advanceExecutor);
    nodeRegistry.register("challenge_verifier", waitInputExecutor);

    const storage = new InMemoryFlowStorage();
    const scheduler = new AuthFlowScheduler({
      flowRegistry,
      nodeRegistry,
      storage,
      services: makeServices(),
    });

    const initState = await scheduler.initFlow({
      flowDefId: "standard-login",
      httpContext: makeHttpContext(),
    });

    await scheduler.cancelFlow(initState.flowId);
    const state = await scheduler.getFlowState(initState.flowId);
    expect(state).toBeNull();
  });
});
