import { describe, expect, it } from "vitest";

import {
  applyBlackboardUpdate,
  createAuthBlackboard,
  type AuthBlackboardSnapshot,
} from "../blackboard.ts";

const mockSecurity: AuthBlackboardSnapshot["security"] = {
  csrfToken: "csrf-token",
  ipHash: "abc123",
  startedAt: "2025-01-01T00:00:00.000Z",
  expiresAt: "2025-01-01T00:10:00.000Z",
  stepNonces: {},
};

describe("createAuthBlackboard", () => {
  it("creates snapshot with correct initial values", () => {
    const snapshot = createAuthBlackboard({
      flowId: "flow-1",
      flowDefId: "standard-login",
      entryNode: "collect-identifier",
      security: mockSecurity,
    });

    expect(snapshot.flowId).toBe("flow-1");
    expect(snapshot.version).toBe(0);
    expect(snapshot.data.flowDefId).toBe("standard-login");
    expect(snapshot.data.currentNode).toBe("collect-identifier");
    expect(snapshot.data.status).toBe("pending");
    expect(snapshot.data.completedNodes).toEqual([]);
    expect(snapshot.data.aal).toBe(0);
    expect(snapshot.data.completedFactors).toEqual([]);
    expect(snapshot.data.nodeOutputs).toEqual({});
    expect(snapshot.data.pluginData).toEqual({});
    expect(snapshot.data.identity).toEqual({});
    expect(snapshot.security).toEqual(mockSecurity);
    expect(snapshot.createdAt).toBeTruthy();
    expect(snapshot.updatedAt).toBeTruthy();
  });

  it("sets timestamps as ISO strings", () => {
    const snapshot = createAuthBlackboard({
      flowId: "flow-2",
      flowDefId: "register",
      entryNode: "collect-identifier",
      security: mockSecurity,
    });
    expect(() => new Date(snapshot.createdAt)).not.toThrow();
    expect(() => new Date(snapshot.updatedAt)).not.toThrow();
  });
});

describe("applyBlackboardUpdate", () => {
  it("increments version on update", () => {
    const snapshot = createAuthBlackboard({
      flowId: "flow-1",
      flowDefId: "standard-login",
      entryNode: "collect-identifier",
      security: mockSecurity,
    });
    const updated = applyBlackboardUpdate(snapshot, { status: "in_progress" });
    expect(updated.version).toBe(1);
    expect(updated.data.status).toBe("in_progress");
  });

  it("increments version twice on two updates", () => {
    const snapshot = createAuthBlackboard({
      flowId: "flow-1",
      flowDefId: "standard-login",
      entryNode: "collect-identifier",
      security: mockSecurity,
    });
    const v1 = applyBlackboardUpdate(snapshot, { status: "in_progress" });
    const v2 = applyBlackboardUpdate(v1, { currentNode: "resolve-identity" });
    expect(v2.version).toBe(2);
    expect(v2.data.currentNode).toBe("resolve-identity");
    expect(v2.data.status).toBe("in_progress");
  });

  it("updates updatedAt timestamp", async () => {
    const snapshot = createAuthBlackboard({
      flowId: "flow-1",
      flowDefId: "standard-login",
      entryNode: "collect-identifier",
      security: mockSecurity,
    });
    const before = snapshot.updatedAt;
    // Advance time slightly
    await new Promise((resolve) => setTimeout(resolve, 2));
    const updated = applyBlackboardUpdate(snapshot, { status: "in_progress" });
    expect(updated.updatedAt).not.toBe(before);
  });

  it("merges nested nodeOutputs", () => {
    const snapshot = createAuthBlackboard({
      flowId: "flow-1",
      flowDefId: "standard-login",
      entryNode: "collect-identifier",
      security: mockSecurity,
    });
    const updated = applyBlackboardUpdate(snapshot, {
      nodeOutputs: { "collect-identifier": { email: "a@b.com" } },
    });
    expect(updated.data.nodeOutputs["collect-identifier"]).toMatchObject({
      email: "a@b.com",
    });
  });

  it("does not mutate original snapshot", () => {
    const snapshot = createAuthBlackboard({
      flowId: "flow-1",
      flowDefId: "standard-login",
      entryNode: "collect-identifier",
      security: mockSecurity,
    });
    applyBlackboardUpdate(snapshot, { status: "in_progress" });
    expect(snapshot.data.status).toBe("pending");
    expect(snapshot.version).toBe(0);
  });

  it("rejects invalid status value", () => {
    const snapshot = createAuthBlackboard({
      flowId: "flow-1",
      flowDefId: "standard-login",
      entryNode: "collect-identifier",
      security: mockSecurity,
    });
    expect(() =>
      applyBlackboardUpdate(snapshot, { status: "invalid_status" }),
    ).toThrow();
  });
});
