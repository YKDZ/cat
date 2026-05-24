import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const calls: string[] = [];
  const activeRunIds = ["run-active"];
  const fakeRecoverCrashedAgentRuns = Symbol("recoverCrashedAgentRuns");
  const fakeApp = {
    all: vi.fn(),
  };
  const fakeDrizzleClient = {
    transaction: vi.fn(async (handler: (tx: unknown) => Promise<unknown>) =>
      handler({}),
    ),
  };
  const fakeDrizzleDB = {
    client: fakeDrizzleClient,
    ping: vi.fn().mockResolvedValue(undefined),
    migrate: vi.fn().mockResolvedValue(undefined),
  };
  const fakeRouteRegistry = {
    resolve: vi.fn(),
  };
  const fakeDiscovery = {
    syncDefinitions: vi.fn().mockResolvedValue(undefined),
  };
  const fakePluginManager = {
    getRouteRegistry: vi.fn(() => fakeRouteRegistry),
    getDiscovery: vi.fn(() => fakeDiscovery),
    restore: vi.fn().mockResolvedValue(undefined),
    getServices: vi.fn().mockReturnValue([]),
  };
  const fakeProfile = {
    name: "lite",
    cache: {
      backend: "memory",
      persistent: false,
      sharedAcrossProcesses: false,
    },
    session: {
      backend: "memory",
      persistent: false,
      sharedAcrossProcesses: false,
    },
    queue: {
      backend: "memory",
      persistent: false,
      sharedAcrossProcesses: false,
    },
    allowNonPersistentBackends: true,
    requireRedis: false,
    requiredSearchLevel: "basic-db-runtime",
    externalServicesOptional: true,
    warnings: [],
  };
  const fakeDatabaseSummary = {
    backend: "postgres-server",
    searchLevel: "basic-db-runtime",
    extensions: {
      vector: false,
      pg_trgm: false,
      rum: false,
      zhparser: false,
    },
    textSearchConfigs: { cat_zh_hans: false },
    functions: { rum_ts_score: false },
    disabledFeatures: ["pgvector"],
    warnings: ["database search capability degraded to basic-db-runtime"],
  };
  const fakeBackends = {
    cacheStore: { id: "cache-store" },
    sessionStore: { id: "session-store" },
    vectorizationQueue: { id: "vectorization-queue" },
    redis: undefined,
  };
  const fakeCleanupHandle = { stop: vi.fn() };
  const fakePluginLoader = { kind: "plugin-loader" };
  const defaultPluginIds = ["password-auth-provider", "json-file-handler"];
  const messageGatewayStart = vi.fn();
  const serverError = vi.fn();
  const serverInfo = vi.fn();
  const serverWarn = vi.fn();

  return {
    activeRunIds,
    assertSearchRuntimeHealth: vi.fn().mockResolvedValue(fakeDatabaseSummary),
    calls,
    createAppPluginLoader: vi.fn(() => fakePluginLoader),
    createDefaultGraphRuntime: vi.fn(),
    createRuntimeBackends: vi.fn().mockResolvedValue(fakeBackends),
    ensureDB: vi.fn().mockResolvedValue(undefined),
    ensureRootUser: vi.fn().mockResolvedValue(undefined),
    executeCommand: vi.fn(),
    executeQuery: vi.fn(),
    fakeApp,
    fakeBackends,
    fakeCleanupHandle,
    fakeDatabaseSummary,
    fakeDiscovery,
    fakeDrizzleClient,
    fakeDrizzleDB,
    fakePluginLoader,
    fakePluginManager,
    fakeProfile,
    fakeRecoverCrashedAgentRuns,
    fakeRouteRegistry,
    getCurrentRedisHandle: vi.fn().mockReturnValue(undefined),
    getDbHandle: vi.fn().mockResolvedValue(fakeDrizzleDB),
    getDefaultPluginIds: vi.fn(() => defaultPluginIds),
    getDefaultRegistries: vi.fn(() => ({
      appMethodRegistry: { id: "registry" },
    })),
    getFirstRegisteredUser: Symbol("getFirstRegisteredUser"),
    getGlobalGraphRuntimeOrNull: vi.fn(() => ({
      scheduler: { getActiveRunIds: vi.fn(() => activeRunIds) },
    })),
    getSetting: Symbol("getSetting"),
    grantFirstUserSuperadmin: vi.fn().mockResolvedValue(undefined),
    initCacheStore: vi.fn(),
    initPermissionEngine: vi.fn(),
    initRuntimeState: vi.fn(),
    initSessionStore: vi.fn(),
    initAllVectorStorage: vi.fn().mockResolvedValue(undefined),
    MessageGateway: class {
      public start = messageGatewayStart;
    },
    messageGatewayStart,
    pluginManagerGet: vi.fn(() => fakePluginManager),
    pluginManagerClear: vi.fn(),
    pluginManagerInstallDefaults: vi.fn().mockResolvedValue(undefined),
    registerAuditHandler: vi.fn(),
    registerBuiltinAgents: vi.fn().mockResolvedValue(undefined),
    registerDomainEventHandlers: vi.fn(),
    registerVectorizationConsumer: vi.fn().mockResolvedValue(undefined),
    recoverCrashedAgentRuns: fakeRecoverCrashedAgentRuns,
    resolveRuntimeProfile: vi.fn(() => fakeProfile),
    seedSystemRoles: vi.fn().mockResolvedValue(undefined),
    serverLogger: {
      withSituation: () => ({
        error: serverError,
        info: serverInfo,
        warn: serverWarn,
      }),
    },
    serverError,
    serverInfo,
    serverWarn,
    setVectorizationQueue: vi.fn(),
    startPostgresRuntimeCleanup: vi.fn(() => fakeCleanupHandle),
    wireEntityStateFetchers: vi.fn(),
  };
});

vi.mock("@cat/agent", () => ({
  registerBuiltinAgents: mocks.registerBuiltinAgents,
}));

vi.mock("@cat/app-api/app", () => ({
  default: mocks.fakeApp,
}));

vi.mock("@cat/db", () => ({
  ensureDB: mocks.ensureDB,
  ensureRootUser: mocks.ensureRootUser,
}));

vi.mock("@cat/domain", () => ({
  executeCommand: mocks.executeCommand,
  executeQuery: mocks.executeQuery,
  getCurrentRedisHandle: mocks.getCurrentRedisHandle,
  getDbHandle: mocks.getDbHandle,
  getFirstRegisteredUser: mocks.getFirstRegisteredUser,
  getSetting: mocks.getSetting,
  initCacheStore: mocks.initCacheStore,
  initRuntimeState: mocks.initRuntimeState,
  initSessionStore: mocks.initSessionStore,
  recoverCrashedAgentRuns: mocks.recoverCrashedAgentRuns,
  resolveRuntimeProfile: mocks.resolveRuntimeProfile,
}));

vi.mock("@cat/message", () => ({
  MessageGateway: mocks.MessageGateway,
}));

vi.mock("@cat/operations", () => ({
  registerDomainEventHandlers: mocks.registerDomainEventHandlers,
  registerVectorizationConsumer: mocks.registerVectorizationConsumer,
}));

vi.mock("@cat/permissions", () => ({
  grantFirstUserSuperadmin: mocks.grantFirstUserSuperadmin,
  initPermissionEngine: mocks.initPermissionEngine,
  registerAuditHandler: mocks.registerAuditHandler,
  seedSystemRoles: mocks.seedSystemRoles,
}));

vi.mock("@cat/plugin-core", () => ({
  PluginManager: {
    clear: mocks.pluginManagerClear,
    get: mocks.pluginManagerGet,
    installDefaults: mocks.pluginManagerInstallDefaults,
  },
}));

vi.mock("@cat/server-shared", () => ({
  initAllVectorStorage: mocks.initAllVectorStorage,
  serverLogger: mocks.serverLogger,
  setVectorizationQueue: mocks.setVectorizationQueue,
}));

vi.mock("@cat/shared", async () => {
  const actual =
    await vi.importActual<typeof import("@cat/shared")>("@cat/shared");
  return {
    ...actual,
  };
});

vi.mock("@cat/vcs", () => ({
  getDefaultRegistries: mocks.getDefaultRegistries,
  wireEntityStateFetchers: mocks.wireEntityStateFetchers,
}));

vi.mock("@cat/workflow", () => ({
  createDefaultGraphRuntime: mocks.createDefaultGraphRuntime,
  getGlobalGraphRuntimeOrNull: mocks.getGlobalGraphRuntimeOrNull,
}));

vi.mock("./default-plugins/catalog", () => ({
  createAppPluginLoader: mocks.createAppPluginLoader,
  getDefaultPluginIds: mocks.getDefaultPluginIds,
}));

vi.mock("./runtime-backends", () => ({
  createRuntimeBackends: mocks.createRuntimeBackends,
}));

vi.mock("./runtime-cleanup", () => ({
  startPostgresRuntimeCleanup: mocks.startPostgresRuntimeCleanup,
}));

vi.mock("./search-runtime-health", () => ({
  assertSearchRuntimeHealth: mocks.assertSearchRuntimeHealth,
}));

import { initializeApp } from "./initialize";

describe("initializeApp", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.calls.length = 0;
    mocks.executeQuery
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce("CAT")
      .mockResolvedValueOnce("http://localhost:3000/");
    mocks.executeCommand.mockImplementation(async (_ctx, command) => {
      if (command === mocks.recoverCrashedAgentRuns) {
        mocks.calls.push("recover-runs");
        return { recoveredRunIds: ["run-1"] };
      }
      return undefined;
    });
    mocks.registerDomainEventHandlers.mockImplementation(() => {
      mocks.calls.push("domain-handlers");
    });
    mocks.registerVectorizationConsumer.mockImplementation(async () => {
      mocks.calls.push("vectorization-consumer");
    });
    mocks.createDefaultGraphRuntime.mockImplementation(() => {
      mocks.calls.push("graph-runtime");
    });
    Reflect.deleteProperty(globalThis, "app");
    globalThis.inited = false;
    globalThis.redis = undefined;
    Reflect.deleteProperty(globalThis, "messageGateway");
    Reflect.deleteProperty(globalThis, "pluginManager");
    globalThis.runtimeCleanup = undefined;
  });

  it("initializes lite runtime without requiring Redis and installs default plugins from an array", async () => {
    const exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation(
        (code?: Parameters<typeof process.exit>[0]): never => {
          throw new Error(
            `process.exit should not be called in this test (received ${String(code)})`,
          );
        },
      );

    await initializeApp();

    expect(mocks.resolveRuntimeProfile).toHaveBeenCalledOnce();
    expect(mocks.assertSearchRuntimeHealth).toHaveBeenCalledWith(
      mocks.fakeDrizzleClient,
      mocks.fakeProfile,
    );
    expect(mocks.initRuntimeState).toHaveBeenCalledWith(
      expect.objectContaining({
        profile: mocks.fakeProfile,
        database: mocks.fakeDatabaseSummary,
      }),
    );
    expect(mocks.createRuntimeBackends).toHaveBeenCalledWith(
      mocks.fakeProfile,
      mocks.fakeDrizzleClient,
    );
    expect(mocks.initCacheStore).toHaveBeenCalledWith(
      mocks.fakeBackends.cacheStore,
    );
    expect(mocks.initSessionStore).toHaveBeenCalledWith(
      mocks.fakeBackends.sessionStore,
    );
    expect(mocks.setVectorizationQueue).toHaveBeenCalledWith(
      mocks.fakeBackends.vectorizationQueue,
    );
    expect(mocks.pluginManagerGet).toHaveBeenCalledWith(
      "GLOBAL",
      "",
      mocks.fakePluginLoader,
    );
    expect(mocks.fakeDiscovery.syncDefinitions).toHaveBeenCalledWith(
      mocks.fakeDrizzleClient,
    );
    expect(mocks.pluginManagerInstallDefaults).toHaveBeenCalledWith(
      mocks.fakeDrizzleClient,
      mocks.fakePluginManager,
      mocks.getDefaultPluginIds(),
    );
    expect(mocks.calls).toEqual([
      "domain-handlers",
      "recover-runs",
      "vectorization-consumer",
      "graph-runtime",
    ]);
    expect(mocks.executeCommand).toHaveBeenCalledWith(
      { db: mocks.fakeDrizzleClient },
      mocks.recoverCrashedAgentRuns,
      { activeRunIds: mocks.activeRunIds },
    );
    expect(mocks.serverWarn).toHaveBeenCalledWith(
      { recoveredRunIds: ["run-1"] },
      "Recovered crashed workflow runs",
    );
    expect(mocks.initAllVectorStorage).not.toHaveBeenCalled();
    expect(mocks.registerVectorizationConsumer).toHaveBeenCalledWith(
      mocks.fakeBackends.vectorizationQueue,
    );
    expect(mocks.getCurrentRedisHandle).toHaveBeenCalledOnce();
    expect(globalThis.app).toBe(mocks.fakeApp);
    expect(globalThis.redis).toBeUndefined();
    expect(globalThis.pluginManager).toBe(mocks.fakePluginManager);
    expect(globalThis.runtimeCleanup).toBe(mocks.fakeCleanupHandle);
    expect(globalThis.inited).toBe(true);
    expect(exitSpy).not.toHaveBeenCalled();

    exitSpy.mockRestore();
  });

  it("exits before readiness when run recovery fails", async () => {
    const exitError = new Error("process.exit called");
    const exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation(
        (_code?: Parameters<typeof process.exit>[0]): never => {
          throw exitError;
        },
      );
    mocks.executeCommand.mockRejectedValueOnce(new Error("db recovery failed"));

    await expect(initializeApp()).rejects.toBe(exitError);

    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(globalThis.inited).not.toBe(true);
    expect(mocks.registerVectorizationConsumer).not.toHaveBeenCalled();
    expect(mocks.createDefaultGraphRuntime).not.toHaveBeenCalled();
    expect(mocks.messageGatewayStart).not.toHaveBeenCalled();

    exitSpy.mockRestore();
  });

  it("exits before readiness when queue recovery fails", async () => {
    const exitError = new Error("process.exit called");
    const exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation(
        (_code?: Parameters<typeof process.exit>[0]): never => {
          throw exitError;
        },
      );
    mocks.registerVectorizationConsumer.mockRejectedValueOnce(
      new Error("redis recovery failed"),
    );

    await expect(initializeApp()).rejects.toBe(exitError);

    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(globalThis.inited).not.toBe(true);
    expect(mocks.createDefaultGraphRuntime).not.toHaveBeenCalled();
    expect(mocks.messageGatewayStart).not.toHaveBeenCalled();

    exitSpy.mockRestore();
  });
});
