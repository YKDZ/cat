/**
 * PluginManager — orchestration-level unit tests
 *
 * All @cat/domain boundary calls (executeCommand / executeQuery / helpers) are
 * mocked via the root __mocks__/@cat/domain.ts.
 * PluginDiscoveryService is mocked inline so its singleton does not leak state.
 */
import type { DrizzleClient } from "@cat/domain";
import type { PluginData, PluginManifest } from "@cat/shared/schema/plugin";

import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { CatPlugin } from "@/entities/plugin";
import type { PluginLoader } from "@/registry/loader";

/* ─── Module mocks (hoisted) ───────────────────────────────────────────────── */

// Domain mock: uses __mocks__/@cat/domain.ts
vi.mock("@cat/domain");

// Discovery service: avoid singleton state leakage between tests
vi.mock("@/registry/plugin-discovery", () => ({
  PluginDiscoveryService: {
    getInstance: vi.fn(),
  },
}));

/* ─── Imports that follow mocks ────────────────────────────────────────────── */
import { executeCommand, executeQuery } from "@cat/domain";

import { ComponentRegistry } from "@/registry/component-registry";
import { PluginDiscoveryService } from "@/registry/plugin-discovery";
import { PluginManager } from "@/registry/plugin-manager";
import { ServiceRegistry } from "@/registry/service-registry";

/* ─── Test helpers ──────────────────────────────────────────────────────────── */

const MINIMAL_MANIFEST: PluginManifest = {
  id: "test-plugin",
  version: "1.0.0",
  entry: "index.js",
  services: [],
};

const MINIMAL_DATA: PluginData = {
  id: "test-plugin",
  name: "Test Plugin",
  version: "1.0.0",
  overview: "A minimal plugin for testing",
  entry: "index.js",
};

function makePlugin(overrides?: Partial<CatPlugin>): CatPlugin {
  return {
    services: vi.fn().mockResolvedValue([]),
    components: vi.fn().mockResolvedValue([]),
    ...overrides,
  };
}

function makeLoader(pluginObj: CatPlugin): PluginLoader {
  return {
    getManifest: vi.fn().mockResolvedValue(MINIMAL_MANIFEST),
    getData: vi.fn().mockResolvedValue(MINIMAL_DATA),
    getInstance: vi.fn().mockResolvedValue(pluginObj),
    listAvailablePlugins: vi.fn().mockResolvedValue([MINIMAL_MANIFEST]),
  };
}

// oxlint-disable-next-line typescript/no-unsafe-type-assertion
const FAKE_DB = {} as DrizzleClient;
const SCOPE_TYPE = "GLOBAL" as const;
const SCOPE_ID = "test-scope";
const PLUGIN_ID = "test-plugin";

/** Set up the default executeQuery sequence for a single activate() call. */
function setupActivateMocks(overrides?: {
  dbId?: number;
  withService?: boolean;
}) {
  const dbId = overrides?.dbId ?? 1;
  const mc = vi.mocked(executeQuery);
  mc.mockReset();

  // 1. mergeConfigDefaults → getPluginConfigInstanceByInstallation → null
  mc.mockResolvedValueOnce(null);
  // 2. loadPlugin → getPluginConfigInstance → null (config = {})
  mc.mockResolvedValueOnce(null);
  // 3. loadPlugin → listPluginServicesForInstallation → []
  mc.mockResolvedValueOnce([]);
  // 4. syncDynamicServices → getPluginInstallation → { id: 1 }
  mc.mockResolvedValueOnce({ id: dbId });
  // 5. syncDynamicServices → listPluginServices → []
  mc.mockResolvedValueOnce([]);
  if (overrides?.withService) {
    // 6. serviceRegistry.combine → listInstalledServicesByType
    mc.mockResolvedValueOnce([
      { dbId, pluginId: PLUGIN_ID, serviceId: "svc-1" },
    ]);
  }

  vi.mocked(executeCommand).mockResolvedValue(undefined);
}

/* ─── Discovery mock setup ─────────────────────────────────────────────────── */

let mockDiscovery: { registerDefinition: ReturnType<typeof vi.fn> };

beforeEach(() => {
  PluginManager.clear();
  vi.clearAllMocks();

  mockDiscovery = {
    registerDefinition: vi.fn().mockResolvedValue(undefined),
  };
  // oxlint-disable-next-line unbound-method
  vi.mocked(PluginDiscoveryService.getInstance).mockReturnValue(
    // oxlint-disable-next-line typescript/no-unsafe-argument, typescript/no-unsafe-type-assertion
    mockDiscovery as unknown as InstanceType<typeof PluginDiscoveryService>,
  );
});

afterEach(() => {
  PluginManager.clear();
});

/* ─── Tests ─────────────────────────────────────────────────────────────────── */

describe("PluginManager — static instance management", () => {
  it("PluginManager.get() returns the same instance for the same scope", () => {
    const loader = makeLoader(makePlugin());
    const a = PluginManager.get(SCOPE_TYPE, SCOPE_ID, loader);
    const b = PluginManager.get(SCOPE_TYPE, SCOPE_ID, loader);
    expect(a).toBe(b);
  });

  it("PluginManager.get() returns distinct instances for different scopes", () => {
    const loader = makeLoader(makePlugin());
    const a = PluginManager.get(SCOPE_TYPE, "scope-A", loader);
    const b = PluginManager.get(SCOPE_TYPE, "scope-B", loader);
    expect(a).not.toBe(b);
  });

  it("PluginManager.clear() removes all cached instances", () => {
    const loader = makeLoader(makePlugin());
    const a = PluginManager.get(SCOPE_TYPE, SCOPE_ID, loader);
    PluginManager.clear();
    const b = PluginManager.get(SCOPE_TYPE, SCOPE_ID, loader);
    expect(a).not.toBe(b);
  });
});

describe("PluginManager — install()", () => {
  it("calls executeCommand with installPlugin args", async () => {
    const loader = makeLoader(makePlugin());
    const manager = new PluginManager(SCOPE_TYPE, SCOPE_ID, loader);
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    vi.mocked(executeCommand).mockResolvedValue(undefined);

    await manager.install(FAKE_DB, PLUGIN_ID);

    expect(vi.mocked(executeCommand)).toHaveBeenCalledOnce();
  });
});

describe("PluginManager — activate() → deactivate()", () => {
  it("activate() marks plugin as active and registers it in the service registry", async () => {
    const svc = {
      getId: () => "svc-1",
      getType: () => "TOKENIZER" as const,
    };
    const plugin = makePlugin({
      services: vi.fn().mockResolvedValue([svc]),
    });
    const loader = makeLoader(plugin);
    setupActivateMocks({ withService: true });

    const manager = new PluginManager(SCOPE_TYPE, SCOPE_ID, loader);
    const app = new Hono();

    await manager.activate(FAKE_DB, PLUGIN_ID, app);

    // Plugin should now have a registered service
    const found = manager.getService(PLUGIN_ID, "TOKENIZER", "svc-1");
    expect(found).not.toBeNull();
    expect(found?.service).toBe(svc);
  });

  it("activate() registers components in the component registry", async () => {
    const component = {
      name: "test-sidebar",
      slot: "sidebar",
      url: "/comp.js",
    };
    const plugin = makePlugin({
      components: vi.fn().mockResolvedValue([component]),
    });
    const loader = makeLoader(plugin);
    setupActivateMocks();

    const manager = new PluginManager(SCOPE_TYPE, SCOPE_ID, loader);
    await manager.activate(FAKE_DB, PLUGIN_ID, new Hono());

    const slotComponents = manager.getComponentOfSlot("sidebar");
    expect(slotComponents).toHaveLength(1);
    expect(slotComponents[0]?.name).toBe("test-sidebar");
  });

  it("activate() calls registerDefinition on the discovery service", async () => {
    const loader = makeLoader(makePlugin());
    setupActivateMocks();

    const manager = new PluginManager(SCOPE_TYPE, SCOPE_ID, loader);
    await manager.activate(FAKE_DB, PLUGIN_ID, new Hono());

    expect(mockDiscovery.registerDefinition).toHaveBeenCalledWith(
      FAKE_DB,
      PLUGIN_ID,
    );
  });

  it("activate() is a no-op when the plugin is already active", async () => {
    const loader = makeLoader(makePlugin());
    setupActivateMocks();

    const manager = new PluginManager(SCOPE_TYPE, SCOPE_ID, loader);
    await manager.activate(FAKE_DB, PLUGIN_ID, new Hono());

    const callsBefore = vi.mocked(executeQuery).mock.calls.length;
    await manager.activate(FAKE_DB, PLUGIN_ID, new Hono()); // second call
    const callsAfter = vi.mocked(executeQuery).mock.calls.length;

    // No extra domain calls should be made
    expect(callsAfter).toBe(callsBefore);
  });

  it("deactivate() removes the plugin's services from the registry", async () => {
    const svc = {
      getId: () => "svc-1",
      getType: () => "TOKENIZER" as const,
    };
    const loader = makeLoader(
      makePlugin({ services: vi.fn().mockResolvedValue([svc]) }),
    );
    setupActivateMocks({ withService: true });

    const manager = new PluginManager(SCOPE_TYPE, SCOPE_ID, loader);
    await manager.activate(FAKE_DB, PLUGIN_ID, new Hono());

    // Service should be present
    expect(manager.getService(PLUGIN_ID, "TOKENIZER", "svc-1")).not.toBeNull();

    await manager.deactivate(FAKE_DB, PLUGIN_ID);

    // Service should be gone
    expect(manager.getService(PLUGIN_ID, "TOKENIZER", "svc-1")).toBeNull();
  });

  it("deactivate() is a no-op when the plugin was never activated", async () => {
    const loader = makeLoader(makePlugin());
    const manager = new PluginManager(SCOPE_TYPE, SCOPE_ID, loader);

    // Should not throw
    await expect(
      manager.deactivate(FAKE_DB, PLUGIN_ID),
    ).resolves.toBeUndefined();
  });

  it("deactivate() removes the plugin's components from the registry", async () => {
    const component = {
      name: "test-toolbar",
      slot: "toolbar",
      url: "/comp.js",
    };
    const loader = makeLoader(
      makePlugin({ components: vi.fn().mockResolvedValue([component]) }),
    );
    setupActivateMocks();

    const manager = new PluginManager(SCOPE_TYPE, SCOPE_ID, loader);
    await manager.activate(FAKE_DB, PLUGIN_ID, new Hono());
    expect(manager.getComponentOfSlot("toolbar")).toHaveLength(1);

    await manager.deactivate(FAKE_DB, PLUGIN_ID);
    expect(manager.getComponentOfSlot("toolbar")).toHaveLength(0);
  });
});

describe("PluginManager — reloadPlugin()", () => {
  it("reloadPlugin() deactivates then re-activates the plugin", async () => {
    const svc = {
      getId: () => "svc-1",
      getType: () => "TOKENIZER" as const,
    };
    const loader = makeLoader(
      makePlugin({ services: vi.fn().mockResolvedValue([svc]) }),
    );
    // First activation
    setupActivateMocks({ withService: true });

    const manager = new PluginManager(SCOPE_TYPE, SCOPE_ID, loader);
    await manager.activate(FAKE_DB, PLUGIN_ID, new Hono());
    expect(manager.getService(PLUGIN_ID, "TOKENIZER", "svc-1")).not.toBeNull();

    // Set up mocks again for the second activate() inside reloadPlugin()
    setupActivateMocks({ withService: true });

    await manager.reloadPlugin(FAKE_DB, PLUGIN_ID, new Hono());

    // Service should still be present after reload
    expect(manager.getService(PLUGIN_ID, "TOKENIZER", "svc-1")).not.toBeNull();
  });
});

describe("PluginManager — uninstall()", () => {
  it("uninstall() calls executeQuery for installation then executeCommand", async () => {
    const loader = makeLoader(makePlugin());
    const manager = new PluginManager(SCOPE_TYPE, SCOPE_ID, loader);

    // Mock: getPluginInstallation returns an installation record
    vi.mocked(executeQuery).mockResolvedValueOnce({ id: 99 });
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    vi.mocked(executeCommand).mockResolvedValue(undefined);

    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    await manager.uninstall(FAKE_DB as never, PLUGIN_ID);

    expect(vi.mocked(executeQuery)).toHaveBeenCalledOnce();
    expect(vi.mocked(executeCommand)).toHaveBeenCalledOnce();
  });
});

describe("PluginManager — service & component getters", () => {
  it("getServices() returns all services of the given type", () => {
    const svc = {
      service: { getId: () => "svc-1", getType: () => "TOKENIZER" as const },
      dbId: 1,
      pluginId: PLUGIN_ID,
      type: "TOKENIZER" as const,
      id: "svc-1",
    };
    const registry = new ServiceRegistry([svc]);
    const manager = new PluginManager(
      SCOPE_TYPE,
      SCOPE_ID,
      makeLoader(makePlugin()),
      undefined,
      registry,
    );

    const result = manager.getServices("TOKENIZER");
    expect(result).toHaveLength(1);
    expect(result[0]?.service.getId()).toBe("svc-1");
  });

  it("getAllServices() returns all registered services", () => {
    const svc = {
      service: { getId: () => "svc-2", getType: () => "TOKENIZER" as const },
      dbId: 2,
      pluginId: PLUGIN_ID,
      type: "TOKENIZER" as const,
      id: "svc-2",
    };
    const registry = new ServiceRegistry([svc]);
    const manager = new PluginManager(
      SCOPE_TYPE,
      SCOPE_ID,
      makeLoader(makePlugin()),
      undefined,
      registry,
    );

    expect(manager.getAllServices()).toHaveLength(1);
  });

  it("getComponents() returns components for a specific plugin", () => {
    const record = {
      name: "test-sidebar" as const,
      pluginId: PLUGIN_ID,
      slot: "sidebar",
      url: "/comp.js",
    };
    const registry = new ComponentRegistry();
    registry.combine(PLUGIN_ID, [record]);
    const manager = new PluginManager(
      SCOPE_TYPE,
      SCOPE_ID,
      makeLoader(makePlugin()),
      undefined,
      undefined,
      registry,
    );

    expect(manager.getComponents(PLUGIN_ID)).toHaveLength(1);
  });

  it("getComponentOfSlot() returns components for a specific slot", () => {
    const record = {
      name: "test-toolbar" as const,
      pluginId: PLUGIN_ID,
      slot: "toolbar",
      url: "/comp.js",
    };
    const registry = new ComponentRegistry();
    registry.combine(PLUGIN_ID, [record]);
    const manager = new PluginManager(
      SCOPE_TYPE,
      SCOPE_ID,
      makeLoader(makePlugin()),
      undefined,
      undefined,
      registry,
    );

    expect(manager.getComponentOfSlot("toolbar")).toHaveLength(1);
    expect(manager.getComponentOfSlot("sidebar")).toHaveLength(0);
  });
});
