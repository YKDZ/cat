import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * PluginManager — orchestration-level unit tests
 *
 * All @cat/domain boundary calls (executeCommand / executeQuery / helpers) are
 * mocked via the root __mocks__/@cat/domain.ts.
 */
import type { DrizzleClient } from "@cat/domain";
import {
  Logger,
  type DiagnosticEvent,
  type PluginData,
  type PluginManifest,
  PluginDataSchema,
  PluginManifestSchema,
} from "@cat/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  CatPlugin,
  PluginContext,
  PluginLogger,
} from "#/entities/plugin.ts";
import type { PluginLoader } from "#/registry/loader.ts";

/* ─── Module mocks (hoisted) ───────────────────────────────────────────────── */

// Domain mock: uses __mocks__/@cat/domain.ts
vi.mock("@cat/domain");

/* ─── Imports that follow mocks ────────────────────────────────────────────── */
import { executeCommand, executeQuery } from "@cat/domain";

import { ComponentRegistry } from "#/registry/component-registry.ts";
import { PluginDiscoveryService } from "#/registry/plugin-discovery.ts";
import { PluginManager } from "#/registry/plugin-manager.ts";
import { ServiceRegistry } from "#/registry/service-registry.ts";

/* ─── Test helpers ──────────────────────────────────────────────────────────── */

const MINIMAL_MANIFEST: PluginManifest = PluginManifestSchema.parse({
  id: "test-plugin",
  version: "1.0.0",
  entry: "index.js",
  services: [],
});

const MINIMAL_DATA: PluginData = PluginDataSchema.parse({
  id: "test-plugin",
  name: "test plugin",
  version: "1.0.0",
  overview: "A minimal plugin for testing",
  entry: "index.js",
});

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
  diagnosticLogger?: PluginLogger,
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
    diagnosticLogger,
  );
}

// oxlint-disable-next-line typescript/no-unsafe-type-assertion
const FAKE_DB = {} as DrizzleClient;
const SCOPE_TYPE = "GLOBAL" as const;
const SCOPE_ID = "";
const PLUGIN_ID = "test-plugin";

/** Set up the default executeQuery sequence for a single activate() call. */
function setupActivateMocks(overrides?: {
  dbId?: number;
  withService?: boolean;
}) {
  const dbId = overrides?.dbId ?? 1;
  const mc = vi.mocked(executeQuery);
  mc.mockReset();

  // 1. loadPlugin → getPluginConfig definition → null
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

const setupConfiguredActivationMocks = (
  endpoint: string,
  revision: number,
): void => {
  const mc = vi.mocked(executeQuery);
  mc.mockReset();
  mc.mockResolvedValueOnce({
    schemaVersion: "1",
    schemaDigest: "a".repeat(64),
    isAvailable: true,
    schema: {
      type: "object",
      properties: { endpoint: { type: "string" } },
      required: ["endpoint"],
    },
  });
  mc.mockResolvedValueOnce({
    appliedVersion: "1",
    revision,
    value: { endpoint },
  });
  mc.mockResolvedValueOnce([]);
  mc.mockResolvedValueOnce({ id: 1 });
  mc.mockResolvedValueOnce([]);
  mc.mockResolvedValueOnce([
    { dbId: 1, pluginId: PLUGIN_ID, serviceId: "svc-1" },
  ]);
  vi.mocked(executeCommand).mockResolvedValue(undefined);
};

const getEndpoint = (context: PluginContext): string => {
  const config = context.config;
  if (
    config === null ||
    typeof config !== "object" ||
    Array.isArray(config) ||
    typeof config["endpoint"] !== "string"
  ) {
    throw new Error("Expected endpoint config");
  }
  return config["endpoint"];
};

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

  it("throws when the same scope is requested with a different diagnostic logger", () => {
    const loader = makeLoader(makePlugin());
    const firstLogger = new Logger({ runtime: "first" });
    const secondLogger = new Logger({ runtime: "second" });

    PluginManager.get(SCOPE_TYPE, SCOPE_ID, loader, firstLogger);

    expect(() => {
      PluginManager.get(SCOPE_TYPE, SCOPE_ID, loader, secondLogger);
    }).toThrow(/different diagnostic logger/i);
  });

  it("keeps the explicitly injected diagnostic logger on cached instances", () => {
    const loader = makeLoader(makePlugin());
    const hostLogger = new Logger({ runtime: "server" });

    const created = PluginManager.get(SCOPE_TYPE, SCOPE_ID, loader, hostLogger);
    const cached = PluginManager.get(SCOPE_TYPE, SCOPE_ID);

    expect(cached).toBe(created);
    expect(cached.getDiagnosticLogger()).toBe(hostLogger);
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
  it("delivers plugin diagnostics to an explicitly registered host observer", async () => {
    const events: DiagnosticEvent[] = [];
    const hostLogger = new Logger({ runtime: "server" });
    hostLogger.observe((event) => {
      events.push(event);
    });
    const plugin = makePlugin({
      services: (context) => {
        context.logger.error("plugin failed to connect", {
          code: "PLUGIN_CONNECTION_FAILED",
          password: "must-not-leak",
        });
        return [];
      },
    });
    setupActivateMocks();

    await createManager(
      makeLoader(plugin),
      undefined,
      undefined,
      hostLogger,
    ).activate(FAKE_DB, PLUGIN_ID);

    expect(events).toContainEqual(
      expect.objectContaining({
        code: "PLUGIN_CONNECTION_FAILED",
        context: expect.objectContaining({
          pluginId: PLUGIN_ID,
          runtime: "server",
          component: "plugin",
        }),
        fields: { password: "[REDACTED]" },
      }),
    );
  });

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

  it("resolves an activated implementation from its stable reference", async () => {
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
    const registered = manager.getServices("TOKENIZER")[0];
    expect(registered).toBeDefined();
    if (!registered) return;

    const reference = manager.createServiceImplementationReference(registered);
    const resolved = manager.resolveServiceImplementationReference(
      reference,
      "TOKENIZER",
    );

    expect(resolved).toMatchObject({
      kind: "RESOLVED",
      service: { service: svc },
    });
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

  it("activate() rejects a stale configuration until it is explicitly migrated", async () => {
    const loader = makeLoader(makePlugin());
    vi.mocked(executeQuery)
      .mockResolvedValueOnce({ schemaVersion: "2", isAvailable: true })
      .mockResolvedValueOnce({ appliedVersion: "1", value: {} });

    await expect(
      createManager(loader).activate(FAKE_DB, PLUGIN_ID),
    ).rejects.toThrow("requires an explicit schema migration");
  });

  it("activate() rejects a required definition without a configuration instance", async () => {
    const loader = makeLoader(makePlugin());
    vi.mocked(executeQuery)
      .mockResolvedValueOnce({
        schemaVersion: "1",
        isAvailable: true,
        schema: {
          type: "object",
          properties: { endpoint: { type: "string" } },
          required: ["endpoint"],
        },
      })
      .mockResolvedValueOnce(null);

    await expect(
      createManager(loader).activate(FAKE_DB, PLUGIN_ID),
    ).rejects.toThrow("requires an explicit configuration instance");
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
  it("reloadPlugin() replaces the plugin's registered services", async () => {
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

  it("captures only complete old or new activation provenance during reload", async () => {
    const clients = new WeakMap<PluginContext, { closed: boolean }>();
    let manager: PluginManager | null = null;
    let publishedServiceAtOldCleanup: unknown;
    const getClient = (context: PluginContext): { closed: boolean } => {
      const client = clients.get(context);
      if (!client) throw new Error("Activation client not initialized");
      return client;
    };
    const createService = (context: PluginContext) => {
      const client = getClient(context);
      return {
        getId: () => "svc-1",
        getType: () => "TOKENIZER" as const,
        getPriority: () => 0,
        parse: () => {
          if (client.closed) throw new Error("Activation client is closed");
          return undefined;
        },
      };
    };
    let oldService: ReturnType<typeof createService> | undefined;
    let newService: ReturnType<typeof createService> | undefined;
    let releaseReload = (): void => undefined;
    let markReloadEntered = (): void => undefined;
    const reloadGate = new Promise<void>((resolve) => {
      releaseReload = resolve;
    });
    const reloadEntered = new Promise<void>((resolve) => {
      markReloadEntered = resolve;
    });
    const plugin = makePlugin({
      onActivate: (context) => {
        clients.set(context, { closed: false });
      },
      onDeactivate: (context) => {
        if (getEndpoint(context) === "old") {
          publishedServiceAtOldCleanup = manager?.getService(
            PLUGIN_ID,
            "TOKENIZER",
            "svc-1",
          )?.service;
        }
        getClient(context).closed = true;
      },
      services: vi.fn(async (context: PluginContext) => {
        const service = createService(context);
        if (getEndpoint(context) === "old") {
          oldService = service;
          return [service];
        }
        newService = service;
        markReloadEntered();
        await reloadGate;
        return [service];
      }),
    });
    const loader = makeLoader(plugin);
    vi.mocked(loader.getData)
      .mockResolvedValueOnce(MINIMAL_DATA)
      .mockResolvedValueOnce(
        PluginDataSchema.parse({ ...MINIMAL_DATA, version: "2.0.0" }),
      );
    manager = createManager(loader);
    setupConfiguredActivationMocks("old", 1);
    await manager.activate(FAKE_DB, PLUGIN_ID);

    const [oldSnapshot] =
      await manager.captureServiceRuntimeSnapshots("TOKENIZER");
    expect(oldSnapshot).toMatchObject({
      activationGeneration: 1,
      configuration: { semanticConfig: { endpoint: "old" } },
      package: { name: "test plugin", version: "1.0.0" },
      reference: {
        pluginId: PLUGIN_ID,
        serviceId: "svc-1",
        serviceType: "TOKENIZER",
      },
    });
    expect(oldSnapshot?.registeredService.service).toBe(oldService);
    expect(() =>
      oldSnapshot?.registeredService.service.parse({
        source: "still live",
        cursor: 0,
      }),
    ).not.toThrow();
    expect(Object.isFrozen(oldSnapshot?.configuration.semanticConfig)).toBe(
      true,
    );

    setupConfiguredActivationMocks("new", 2);
    const reload = manager.reloadPlugin(FAKE_DB, PLUGIN_ID);
    await reloadEntered;
    expect(() =>
      oldSnapshot?.registeredService.service.parse({
        source: "live during candidate preparation",
        cursor: 0,
      }),
    ).not.toThrow();
    let captureSettled = false;
    const capture = manager
      .captureServiceRuntimeSnapshots("TOKENIZER")
      .then((snapshots) => {
        captureSettled = true;
        return snapshots;
      });
    await Promise.resolve();
    expect(captureSettled).toBe(false);

    releaseReload();
    await reload;
    const [newSnapshot] = await capture;
    expect(newSnapshot).toMatchObject({
      activationGeneration: 2,
      configuration: { semanticConfig: { endpoint: "new" } },
      package: { name: "test plugin", version: "2.0.0" },
    });
    expect(newSnapshot?.registeredService.service).toBe(newService);
    expect(publishedServiceAtOldCleanup).toBe(newService);
    expect(() => oldService?.parse()).toThrow("Activation client is closed");
    expect(() =>
      newSnapshot?.registeredService.service.parse({
        source: "new generation",
        cursor: 0,
      }),
    ).not.toThrow();
    expect(newSnapshot?.configuration.configurationDigest).not.toBe(
      oldSnapshot?.configuration.configurationDigest,
    );
  });

  it("keeps the prior activation snapshot when reload preparation fails", async () => {
    const clients = new WeakMap<PluginContext, { closed: boolean }>();
    const getClient = (context: PluginContext): { closed: boolean } => {
      const client = clients.get(context);
      if (!client) throw new Error("Activation client not initialized");
      return client;
    };
    const createService = (context: PluginContext) => {
      const client = getClient(context);
      return {
        getId: () => "svc-1",
        getType: () => "TOKENIZER" as const,
        getPriority: () => 0,
        parse: () => {
          if (client.closed) throw new Error("Activation client is closed");
          return undefined;
        },
      };
    };
    let oldService: ReturnType<typeof createService> | undefined;
    let rolledBackService: ReturnType<typeof createService> | undefined;
    let oldConfigActivationCount = 0;
    const plugin = makePlugin({
      onActivate: (context) => {
        clients.set(context, { closed: false });
      },
      onDeactivate: (context) => {
        getClient(context).closed = true;
      },
      services: vi.fn(async (context: PluginContext) => {
        const service = createService(context);
        if (getEndpoint(context) === "old") {
          oldConfigActivationCount += 1;
          if (oldConfigActivationCount === 1) oldService = service;
          else rolledBackService = service;
        }
        return [service];
      }),
      components: vi.fn(async (context: PluginContext) => {
        if (getEndpoint(context) === "new") {
          throw new Error("new runtime rejected config");
        }
        return [];
      }),
    });
    const manager = createManager(makeLoader(plugin));
    setupConfiguredActivationMocks("old", 1);
    await manager.activate(FAKE_DB, PLUGIN_ID);
    const [before] = await manager.captureServiceRuntimeSnapshots("TOKENIZER");

    setupConfiguredActivationMocks("new", 2);
    await expect(manager.reloadPlugin(FAKE_DB, PLUGIN_ID)).rejects.toThrow(
      "new runtime rejected config",
    );

    const [after] = await manager.captureServiceRuntimeSnapshots("TOKENIZER");
    expect(after?.registeredService.service).toBe(oldService);
    expect(after?.activationGeneration).toBe(1);
    expect(after?.configuration).toBe(before?.configuration);
    expect(() =>
      after?.registeredService.service.parse({
        source: "old generation after failed candidate",
        cursor: 0,
      }),
    ).not.toThrow();

    setupConfiguredActivationMocks("old", 3);
    await manager.reloadPlugin(FAKE_DB, PLUGIN_ID);
    const [rolledBack] =
      await manager.captureServiceRuntimeSnapshots("TOKENIZER");
    expect(rolledBack?.registeredService.service).toBe(rolledBackService);
    expect(rolledBack?.activationGeneration).toBe(2);
    expect(rolledBack?.configuration.semanticConfig).toEqual({
      endpoint: "old",
    });
    expect(rolledBack?.configuration.configurationDigest).toBe(
      before?.configuration.configurationDigest,
    );
    expect(() => oldService?.parse()).toThrow("Activation client is closed");
    expect(() =>
      rolledBack?.registeredService.service.parse({
        source: "rolled back generation",
        cursor: 0,
      }),
    ).not.toThrow();
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
