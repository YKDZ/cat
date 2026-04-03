import { describe, expect, it } from "vitest";

import type { AuthFlowDefinition } from "../types.ts";

import {
  AuthFlowRegistry,
  AuthFlowValidationError,
  validateAuthFlow,
} from "../flow-registry.ts";
import { registerFlow } from "../flows/register.ts";
import { standardLoginFlow } from "../flows/standard-login.ts";

describe("validateAuthFlow", () => {
  it("accepts a valid flow (standardLoginFlow)", () => {
    expect(() => {
      validateAuthFlow(standardLoginFlow);
    }).not.toThrow();
  });

  it("accepts registerFlow", () => {
    expect(() => {
      validateAuthFlow(registerFlow);
    }).not.toThrow();
  });

  it("rejects flow where entry node does not exist", () => {
    const bad: AuthFlowDefinition = {
      ...standardLoginFlow,
      entry: "non-existent",
    };
    expect(() => {
      validateAuthFlow(bad);
    }).toThrow(AuthFlowValidationError);
  });

  it("rejects flow where terminal node does not exist", () => {
    const bad: AuthFlowDefinition = {
      ...standardLoginFlow,
      terminalNodes: {
        success: ["ghost-node"],
        failure: ["user-not-found"],
      },
    };
    expect(() => {
      validateAuthFlow(bad);
    }).toThrow(AuthFlowValidationError);
  });

  it("rejects flow with a cycle", () => {
    const cyclic: AuthFlowDefinition = {
      id: "cyclic",
      version: "1.0.0",
      nodes: {
        a: {
          id: "a",
          type: "credential_collector",
          clientHint: { componentType: "identifier_input" },
        },
        b: {
          id: "b",
          type: "credential_collector",
          clientHint: { componentType: "password_input" },
        },
        end: {
          id: "end",
          type: "session_finalizer",
          clientHint: { componentType: "none" },
        },
      },
      edges: [
        { from: "a", to: "b" },
        { from: "b", to: "a" }, // cycle!
        { from: "b", to: "end" },
      ],
      entry: "a",
      terminalNodes: { success: ["end"], failure: [] },
    };
    expect(() => {
      validateAuthFlow(cyclic);
    }).toThrow(AuthFlowValidationError);
  });

  it("rejects flow with unreachable terminal", () => {
    const bad: AuthFlowDefinition = {
      id: "bad",
      version: "1.0.0",
      nodes: {
        a: {
          id: "a",
          type: "credential_collector",
          clientHint: { componentType: "identifier_input" },
        },
        b: {
          id: "b",
          type: "decision_router",
          clientHint: { componentType: "none" },
        },
        end: {
          id: "end",
          type: "session_finalizer",
          clientHint: { componentType: "none" },
        },
      },
      // b has no outgoing edges, so end is unreachable from a through b
      edges: [{ from: "a", to: "b" }],
      entry: "a",
      terminalNodes: { success: ["end"], failure: [] },
    };
    expect(() => {
      validateAuthFlow(bad);
    }).toThrow(AuthFlowValidationError);
  });
});

describe("AuthFlowRegistry", () => {
  it("registers and retrieves a flow by id", () => {
    const registry = new AuthFlowRegistry();
    registry.register(standardLoginFlow);
    const flow = registry.get(standardLoginFlow.id);
    expect(flow).toBeDefined();
    expect(flow?.id).toBe(standardLoginFlow.id);
  });

  it("retrieves a flow by id@version", () => {
    const registry = new AuthFlowRegistry();
    registry.register(standardLoginFlow);
    const flow = registry.get(standardLoginFlow.id, standardLoginFlow.version);
    expect(flow?.version).toBe(standardLoginFlow.version);
  });

  it("lists registered flows", () => {
    const registry = new AuthFlowRegistry();
    registry.register(standardLoginFlow);
    registry.register(registerFlow);
    const flows = registry.list();
    expect(flows.length).toBe(2);
    const ids = flows.map((f) => f.id);
    expect(ids).toContain("standard-login");
    expect(ids).toContain("register");
  });

  it("returns undefined for unknown flow", () => {
    const registry = new AuthFlowRegistry();
    expect(registry.get("unknown")).toBeUndefined();
  });
});
