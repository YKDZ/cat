/**
 * PluginManager — orchestration-level unit tests
 *
 * All @cat/domain boundary calls (executeCommand / executeQuery / helpers) are
 * mocked via the root __mocks__/@cat/domain.ts.
 */
import type { DrizzleClient } from "@cat/domain";
import type { PluginData, PluginManifest } from "@cat/shared";

import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { CatPlugin } from "@/entities/plugin";
import type { PluginLoader } from "@/registry/loader";

/* ─── Module mocks (hoisted) ───────────────────────────────────────────────── */

// Domain mock: uses __mocks__/@cat/domain.ts
vi.mock("@cat/domain");

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
    resolveAssetPath: vi.fn().mockResolvedValue(null),
  };
}

function createManager(
  loader: PluginLoader,
  serviceRegistry?: ServiceRegistry,
  componentRegistry?: ComponentRegistry,
): PluginManager {
  mockDiscovery.getLoader.mockReturnValue(loader);

  return new PluginManager(
    SCOPE_TYPE,
    SCOPE_ID,
    loader,
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    mockDiscovery as unknown as PluginDiscoveryService,
    serviceRegistry,
    componentRegistry,
  );
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

let mockDiscovery: {
  getLoader: ReturnType<typeof vi.fn>;
  registerDefinition: ReturnType<typeof vi.fn>;
  syncDefinitions: ReturnType<typeof vi.fn>;
};

beforeEach(() => {
  PluginManager.clear();
  vi.clearAllMocks();

  mockDiscovery = {
    getLoader: vi.fn(),
    registerDefinition: vi.fn().mockResolvedValue(undefined),
    syncDefinitions: vi.fn().mockResolvedValue(undefined),
  };
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

  it("throws when the same scope is requested with a different loader", () => {
    const firstLoader = makeLoader(makePlugin());
    const secondLoader = makeLoader(makePlugin());

    PluginManager.get(SCOPE_TYPE, SCOPE_ID, firstLoader);

    expect(() => {
      PluginManager.get(SCOPE_TYPE, SCOPE_ID, secondLoader);
    }).toThrow(/different loader/i);
  });

  it("PluginManager.clear() removes all cached instances", () => {
    const loader = makeLoader(makePlugin());
    const a = PluginManager.get(SCOPE_TYPE, SCOPE_ID, loader);
    PluginManager.clear();
    const b = PluginManager.get(SCOPE_TYPE, SCOPE_ID, loader);
    expect(a).not.toBe(b);
  });

  it("PluginManager.clear() allows recreating a scope with a different loader", () => {
    const firstLoader = makeLoader(makePlugin());
    const secondLoader = makeLoader(makePlugin());

    PluginManager.get(SCOPE_TYPE, SCOPE_ID, firstLoader);
    PluginManager.clear();

    const recreated = PluginManager.get(SCOPE_TYPE, SCOPE_ID, secondLoader);

    expect(recreated.getLoader()).toBe(secondLoader);
  });
});

describe("PluginManager — install()", () => {
  it("calls executeCommand with installPlugin args", async () => {
    const loader = makeLoader(makePlugin());
    const manager = createManager(loader);
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

    const manager = createManager(loader);

    await manager.activate(FAKE_DB, PLUGIN_ID);

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

    const manager = createManager(loader);
    await manager.activate(FAKE_DB, PLUGIN_ID);

    const slotComponents = manager.getComponentOfSlot("sidebar");
    expect(slotComponents).toHaveLength(1);
    expect(slotComponents[0]?.name).toBe("test-sidebar");
  });

  it("activate() calls registerDefinition on the discovery service", async () => {
    const loader = makeLoader(makePlugin());
    setupActivateMocks();

    const manager = createManager(loader);
    await manager.activate(FAKE_DB, PLUGIN_ID);

    expect(mockDiscovery.registerDefinition).toHaveBeenCalledWith(
      FAKE_DB,
      PLUGIN_ID,
    );
  });

  it("activate() is a no-op when the plugin is already active", async () => {
    const loader = makeLoader(makePlugin());
    setupActivateMocks();

    const manager = createManager(loader);
    await manager.activate(FAKE_DB, PLUGIN_ID);

    const callsBefore = vi.mocked(executeQuery).mock.calls.length;
    await manager.activate(FAKE_DB, PLUGIN_ID); // second call
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

    const manager = createManager(loader);
    await manager.activate(FAKE_DB, PLUGIN_ID);

    // Service should be present
    expect(manager.getService(PLUGIN_ID, "TOKENIZER", "svc-1")).not.toBeNull();

    await manager.deactivate(FAKE_DB, PLUGIN_ID);

    // Service should be gone
    expect(manager.getService(PLUGIN_ID, "TOKENIZER", "svc-1")).toBeNull();
  });

  it("deactivate() is a no-op when the plugin was never activated", async () => {
    const loader = makeLoader(makePlugin());
    const manager = createManager(loader);

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

    const manager = createManager(loader);
    await manager.activate(FAKE_DB, PLUGIN_ID);
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

    const manager = createManager(loader);
    await manager.activate(FAKE_DB, PLUGIN_ID);
    expect(manager.getService(PLUGIN_ID, "TOKENIZER", "svc-1")).not.toBeNull();

    // Set up mocks again for the second activate() inside reloadPlugin()
    setupActivateMocks({ withService: true });

    await manager.reloadPlugin(FAKE_DB, PLUGIN_ID);

    // Service should still be present after reload
    expect(manager.getService(PLUGIN_ID, "TOKENIZER", "svc-1")).not.toBeNull();
  });
});

describe("PluginManager — uninstall()", () => {
  it("uninstall() calls executeQuery for installation then executeCommand", async () => {
    const loader = makeLoader(makePlugin());
    const manager = createManager(loader);

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
    const manager = createManager(makeLoader(makePlugin()), registry);

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
    const manager = createManager(makeLoader(makePlugin()), registry);

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
    const manager = createManager(
      makeLoader(makePlugin()),
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
    const manager = createManager(
      makeLoader(makePlugin()),
      undefined,
      registry,
    );

    expect(manager.getComponentOfSlot("toolbar")).toHaveLength(1);
    expect(manager.getComponentOfSlot("sidebar")).toHaveLength(0);
  });
});

describe("PluginManager — runtime snapshots and transient services", () => {
  it("getRuntimeSnapshot() reports active services, components, and routes", async () => {
    const svc = { getId: () => "svc-1", getType: () => "TOKENIZER" as const };
    const component = { name: "test-panel", slot: "panel", url: "/panel.js" };
    const plugin = makePlugin({
      services: vi.fn().mockResolvedValue([svc]),
      components: vi.fn().mockResolvedValue([component]),
    });
    setupActivateMocks({ withService: true });

    const manager = createManager(makeLoader(plugin));
    await manager.activate(FAKE_DB, PLUGIN_ID);

    const snapshot = manager.getRuntimeSnapshot(PLUGIN_ID);

    expect(snapshot.isActive).toBe(true);
    expect(snapshot.services).toHaveLength(1);
    expect(snapshot.components).toHaveLength(1);
    expect(snapshot.hasRoute).toBe(false);
  });

  it("createTransientServices() does not mutate the active registry", async () => {
    const svc = {
      getId: () => "candidate",
      getType: () => "TOKENIZER" as const,
    };
    const plugin = makePlugin({ services: vi.fn().mockResolvedValue([svc]) });
    const manager = createManager(makeLoader(plugin));
    vi.mocked(executeQuery).mockReset();
    vi.mocked(executeQuery).mockResolvedValueOnce([]);

    const services = await manager.createTransientServices(FAKE_DB, PLUGIN_ID, {
      enabled: true,
    });

    expect(services).toEqual([svc]);
    expect(manager.getRuntimeSnapshot(PLUGIN_ID).services).toHaveLength(0);
    expect(manager.isActive(PLUGIN_ID)).toBe(false);
  });
});

describe("PluginManager.installDefaults()", () => {
  it("installs missing plugins from a string array", async () => {
    const manager = createManager(makeLoader(makePlugin()));
    const installSpy = vi
      .spyOn(manager, "install")
      .mockResolvedValue(undefined);
    vi.mocked(executeQuery).mockResolvedValueOnce([]);

    await PluginManager.installDefaults(FAKE_DB, manager, [PLUGIN_ID]);

    expect(installSpy).toHaveBeenCalledWith(FAKE_DB, PLUGIN_ID);
  });

  it("still accepts a legacy JSON file path", async () => {
    const manager = createManager(makeLoader(makePlugin()));
    const installSpy = vi
      .spyOn(manager, "install")
      .mockResolvedValue(undefined);
    vi.mocked(executeQuery).mockResolvedValueOnce([]);

    const dir = await mkdtemp(join(tmpdir(), "plugin-defaults-"));
    const filePath = join(dir, "defaults.json");

    try {
      await writeFile(filePath, JSON.stringify([PLUGIN_ID]), "utf8");
      await PluginManager.installDefaults(FAKE_DB, manager, filePath);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }

    expect(installSpy).toHaveBeenCalledWith(FAKE_DB, PLUGIN_ID);
  });
});
