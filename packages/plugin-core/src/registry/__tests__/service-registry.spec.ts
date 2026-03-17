import type { DbHandle } from "@cat/domain";

import { beforeEach, describe, expect, it, vi } from "vitest";

// Activate __mocks__/@cat/domain.ts — must be hoisted before any @cat/domain import
vi.mock("@cat/domain");

import { executeQuery } from "@cat/domain";

import type { RegisteredService } from "@/registry/service-registry";

import { ServiceRegistry } from "@/registry/service-registry";

// ─── helpers ─────────────────────────────────────────────────────────────────

// oxlint-disable-next-line typescript/no-unsafe-type-assertion
const FAKE_DB = {} as unknown as DbHandle;

const makeService = (
  id: string,
  type: RegisteredService["type"] = "AUTH_PROVIDER",
) => ({
  getId: () => id,
  getType: () => type,
});

const makeRegisteredService = (
  partial: Partial<RegisteredService> & {
    pluginId: string;
    id: string;
  },
): RegisteredService => ({
  type: "AUTH_PROVIDER",
  dbId: 1,
  service: makeService(partial.id),
  ...partial,
});

// ─── tests ───────────────────────────────────────────────────────────────────

describe("ServiceRegistry — synchronous API (get / getAll / remove / clear)", () => {
  it("(constructor) initialises from pre-populated list", () => {
    const initial = [
      makeRegisteredService({ pluginId: "plugin-a", id: "svc-1" }),
    ];
    const registry = new ServiceRegistry(initial);

    expect(registry.getAll()).toHaveLength(1);
  });

  it("(constructor) defaults to empty when no argument given", () => {
    const registry = new ServiceRegistry();

    expect(registry.getAll()).toEqual([]);
  });

  it("get returns matching service", () => {
    const svc = makeRegisteredService({ pluginId: "plugin-a", id: "svc-1" });
    const registry = new ServiceRegistry([svc]);

    expect(registry.get("plugin-a", "AUTH_PROVIDER", "svc-1")).toEqual(svc);
  });

  it("get returns null for unknown pluginId", () => {
    const registry = new ServiceRegistry();

    expect(registry.get("missing", "AUTH_PROVIDER", "svc-1")).toBeNull();
  });

  it("get returns null when type does not match", () => {
    const svc = makeRegisteredService({
      pluginId: "plugin-a",
      id: "svc-1",
      type: "AUTH_PROVIDER",
    });
    const registry = new ServiceRegistry([svc]);

    expect(registry.get("plugin-a", "MFA_PROVIDER", "svc-1")).toBeNull();
  });

  it("removeByPlugin removes all services for that plugin", () => {
    const services = [
      makeRegisteredService({ pluginId: "plugin-a", id: "svc-1" }),
      makeRegisteredService({ pluginId: "plugin-a", id: "svc-2" }),
      makeRegisteredService({ pluginId: "plugin-b", id: "svc-3" }),
    ];
    const registry = new ServiceRegistry(services);

    registry.removeByPlugin("plugin-a");

    expect(registry.getAll()).toHaveLength(1);
    expect(registry.getAll()[0]?.pluginId).toBe("plugin-b");
  });

  it("removeByPlugin on unknown plugin is a no-op", () => {
    const svc = makeRegisteredService({ pluginId: "plugin-a", id: "svc-1" });
    const registry = new ServiceRegistry([svc]);

    registry.removeByPlugin("ghost-plugin");

    expect(registry.getAll()).toHaveLength(1);
  });

  it("clear removes all services", () => {
    const services = [
      makeRegisteredService({ pluginId: "plugin-a", id: "svc-1" }),
      makeRegisteredService({ pluginId: "plugin-b", id: "svc-2" }),
    ];
    const registry = new ServiceRegistry(services);

    registry.clear();

    expect(registry.getAll()).toEqual([]);
  });
});

describe("ServiceRegistry.combine (with mocked domain)", () => {
  let registry: ServiceRegistry;

  beforeEach(() => {
    vi.clearAllMocks();
    registry = new ServiceRegistry();
  });

  it("registers service when DB record is present", async () => {
    const svc = makeService("AUTH_PASS");
    vi.mocked(executeQuery).mockResolvedValueOnce([
      { dbId: 42, pluginId: "password-auth", serviceId: "AUTH_PASS" },
    ]);

    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    await registry.combine(FAKE_DB, "PROJECT", "proj-1", "password-auth", [
      svc,
    ]);

    const registered = registry.get(
      "password-auth",
      "AUTH_PROVIDER",
      "AUTH_PASS",
    );
    expect(registered).not.toBeNull();
    expect(registered?.dbId).toBe(42);
  });

  it("skips service when no DB record is found", async () => {
    const svc = makeService("AUTH_PASS");
    vi.mocked(executeQuery).mockResolvedValueOnce([]); // no DB records

    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    await registry.combine(FAKE_DB, "PROJECT", "proj-1", "password-auth", [
      svc,
    ]);

    expect(registry.getAll()).toHaveLength(0);
  });

  it("replaces existing services on re-combine (reload support)", async () => {
    // First combine — register with dbId 1
    vi.mocked(executeQuery).mockResolvedValueOnce([
      { dbId: 1, pluginId: "password-auth", serviceId: "AUTH_PASS" },
    ]);
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    await registry.combine(FAKE_DB, "PROJECT", "proj-1", "password-auth", [
      makeService("AUTH_PASS"),
    ]);
    expect(registry.getAll()).toHaveLength(1);

    // Reload: second combine overwrites with dbId 2
    vi.mocked(executeQuery).mockResolvedValueOnce([
      { dbId: 2, pluginId: "password-auth", serviceId: "AUTH_PASS" },
    ]);
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    await registry.combine(FAKE_DB, "PROJECT", "proj-1", "password-auth", [
      makeService("AUTH_PASS"),
    ]);

    expect(registry.getAll()).toHaveLength(1);
    expect(registry.getAll()[0]?.dbId).toBe(2);
  });

  it("does not affect other plugins' services", async () => {
    // Pre-populate with plugin-b
    const existing = makeRegisteredService({
      pluginId: "plugin-b",
      id: "svc-b",
    });
    registry = new ServiceRegistry([existing]);

    vi.mocked(executeQuery).mockResolvedValueOnce([
      { dbId: 10, pluginId: "plugin-a", serviceId: "svc-a" },
    ]);
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    await registry.combine(FAKE_DB, "PROJECT", "proj-1", "plugin-a", [
      makeService("svc-a"),
    ]);

    expect(registry.getAll()).toHaveLength(2);
    expect(registry.get("plugin-b", "AUTH_PROVIDER", "svc-b")).not.toBeNull();
  });
});
