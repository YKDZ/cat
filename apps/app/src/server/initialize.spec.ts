import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const calls: string[] = [];
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
    externalServicesOptional: true,
    warnings: [],
  };
  const fakeDatabaseAssessment = {
    requirements: [
      { id: "POSTGRESQL_CORE", status: "SATISFIED" },
      { id: "POSTGRESQL_TRIGRAM_MATCHING", status: "SATISFIED" },
      { id: "POSTGRESQL_VECTOR_STORAGE", status: "SATISFIED" },
    ],
  };
  const fakeBackends = {
    cacheStore: { id: "cache-store" },
    sessionStore: { id: "session-store" },
    vectorizationQueue: { id: "vectorization-queue" },
    redis: undefined,
  };
  const fakeCleanupHandle = { stop: vi.fn() };
  const stopRecallDerivationWorker = vi.fn().mockResolvedValue(undefined);
  const fakeRecallDerivationWorker = { stop: stopRecallDerivationWorker };
  const recallDerivationTaskProjectionObserver = vi.fn();
  const ensureTaskRecovery = vi.fn().mockResolvedValue(undefined);
  const disposeGraphRuntime = vi.fn().mockResolvedValue(undefined);
  const fakeGraphRuntime = {
    ensureTaskRecovery,
    dispose: disposeGraphRuntime,
  };
  const fakePluginLoader = { kind: "plugin-loader" };
  const defaultPluginIds = ["password-auth-provider", "json-file-handler"];
  const messageGatewayStart = vi.fn();
  const messageGatewayStop = vi.fn();
  const serverError = vi.fn();
  const serverInfo = vi.fn();
  const serverWarn = vi.fn();
  const configureReadinessReporter = vi.fn();
  const createReadinessReporter = vi.fn((options) => options);
  const ReadinessProbeFailure = class extends Error {};

  return {
    assertDatabaseRequirements: vi
      .fn()
      .mockResolvedValue(fakeDatabaseAssessment),
    assessDatabaseRequirements: vi
      .fn()
      .mockResolvedValue(fakeDatabaseAssessment),
    bootstrapApplicationData: vi.fn(),
    calls,
    configureReadinessReporter,
    createReadinessReporter,
    createAppPluginLoader: vi.fn(() => fakePluginLoader),
    createDefaultGraphRuntime: vi.fn(),
    createRuntimeBackends: vi.fn().mockResolvedValue(fakeBackends),
    executeQuery: vi.fn(),
    ensureTaskRecovery,
    fakeApp,
    fakeBackends,
    fakeCleanupHandle,
    fakeDatabaseAssessment,
    fakeDiscovery,
    fakeDrizzleClient,
    fakeDrizzleDB,
    fakeGraphRuntime,
    fakePluginLoader,
    fakePluginManager,
    fakeRecallDerivationWorker,
    fakeProfile,
    fakeRouteRegistry,
    getCacheStore: vi.fn(() => fakeBackends.cacheStore),
    getCurrentRedisHandle: vi.fn().mockReturnValue(undefined),
    getDbHandle: vi.fn().mockResolvedValue(fakeDrizzleDB),
    getDefaultPluginIds: vi.fn(() => defaultPluginIds),
    getDefaultRegistries: vi.fn(() => ({
      appMethodRegistry: { id: "registry" },
    })),
    getGlobalGraphRuntimeOrNull: vi.fn(),
    getSetting: Symbol("getSetting"),
    getSessionStore: vi.fn(() => fakeBackends.sessionStore),
    initCacheStore: vi.fn(),
    initPermissionEngine: vi.fn(),
    initRuntimeState: vi.fn(),
    initSessionStore: vi.fn(),
    initAllVectorStorage: vi.fn().mockResolvedValue(undefined),
    MessageGateway: class {
      public start = messageGatewayStart;
      public stop = messageGatewayStop;
    },
    messageGatewayStart,
    messageGatewayStop,
    pluginManagerGet: vi.fn(() => fakePluginManager),
    pluginManagerClear: vi.fn(),
    pluginManagerInstallDefaults: vi.fn().mockResolvedValue(undefined),
    registerAuditHandler: vi.fn(),
    registerDomainEventHandlers: vi.fn(),
    registerVectorizationConsumer: vi.fn().mockResolvedValue(undefined),
    createRecallDerivationTaskProjectionObserver: vi.fn(
      () => recallDerivationTaskProjectionObserver,
    ),
    recallDerivationTaskProjectionObserver,
    startRecallDerivationWorker: vi.fn(),
    stopRecallDerivationWorker,
    ReadinessProbeFailure,
    disposeGraphRuntime,
    resolveRuntimeProfile: vi.fn(() => fakeProfile),
    serverLogger: {
      child: () => ({
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

vi.mock("@cat/app-api/app", () => ({
  configureReadinessReporter: mocks.configureReadinessReporter,
  createReadinessReporter: mocks.createReadinessReporter,
  default: mocks.fakeApp,
  ReadinessProbeFailure: mocks.ReadinessProbeFailure,
}));

vi.mock("@cat/domain", () => ({
  assertDatabaseRequirements: mocks.assertDatabaseRequirements,
  assessDatabaseRequirements: mocks.assessDatabaseRequirements,
  executeQuery: mocks.executeQuery,
  getCacheStore: mocks.getCacheStore,
  getCurrentRedisHandle: mocks.getCurrentRedisHandle,
  getRuntimeState: vi.fn(),
  getDbHandle: mocks.getDbHandle,
  getSetting: mocks.getSetting,
  getSessionStore: mocks.getSessionStore,
  initCacheStore: mocks.initCacheStore,
  initRuntimeState: mocks.initRuntimeState,
  initSessionStore: mocks.initSessionStore,
  resolveRuntimeProfile: mocks.resolveRuntimeProfile,
}));

vi.mock("@cat/message", () => ({
  MessageGateway: mocks.MessageGateway,
}));

vi.mock("@cat/operations", () => ({
  createRecallDerivationTaskProjectionObserver:
    mocks.createRecallDerivationTaskProjectionObserver,
  registerDomainEventHandlers: mocks.registerDomainEventHandlers,
  registerVectorizationConsumer: mocks.registerVectorizationConsumer,
  startRecallDerivationWorker: mocks.startRecallDerivationWorker,
}));

vi.mock("@cat/permissions", () => ({
  initPermissionEngine: mocks.initPermissionEngine,
  registerAuditHandler: mocks.registerAuditHandler,
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

vi.mock("./default-plugins/catalog.ts", () => ({
  createAppPluginLoader: mocks.createAppPluginLoader,
}));

vi.mock("./application-data-bootstrap.ts", () => ({
  bootstrapApplicationData: mocks.bootstrapApplicationData,
}));

vi.mock("./runtime-backends.ts", () => ({
  createRuntimeBackends: mocks.createRuntimeBackends,
}));

vi.mock("./runtime-cleanup.ts", () => ({
  startPostgresRuntimeCleanup: mocks.startPostgresRuntimeCleanup,
}));

import { initializeApp } from "./initialize.ts";
import { resetRuntimeCapabilitiesForTest } from "./runtime-capabilities.ts";

describe("initializeApp", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.calls.length = 0;
    mocks.ensureTaskRecovery.mockImplementation(async () => {
      mocks.calls.push("recover-tasks");
    });
    mocks.disposeGraphRuntime.mockResolvedValue(undefined);
    mocks.getGlobalGraphRuntimeOrNull.mockReturnValue(null);
    mocks.executeQuery
      .mockResolvedValueOnce("CAT")
      .mockResolvedValueOnce("http://localhost:3000/");
    mocks.registerDomainEventHandlers.mockImplementation(() => {
      mocks.calls.push("domain-handlers");
    });
    mocks.registerVectorizationConsumer.mockImplementation(async () => {
      mocks.calls.push("vectorization-consumer");
    });
    mocks.bootstrapApplicationData.mockImplementation(async () => {
      mocks.calls.push("bootstrap");
    });
    mocks.startRecallDerivationWorker.mockImplementation(async () => {
      mocks.calls.push("recall-derivation-worker");
      return mocks.fakeRecallDerivationWorker;
    });
    mocks.createDefaultGraphRuntime.mockImplementation(() => {
      mocks.calls.push("graph-runtime");
      return mocks.fakeGraphRuntime;
    });
    mocks.messageGatewayStart.mockImplementation(() => {
      mocks.calls.push("message-gateway");
    });
    Reflect.deleteProperty(globalThis, "app");
    Reflect.deleteProperty(process, "__CAT_INITIALIZATION_PROMISE__");
    resetRuntimeCapabilitiesForTest();
    globalThis.inited = false;
    globalThis.redis = undefined;
    Reflect.deleteProperty(globalThis, "messageGateway");
    Reflect.deleteProperty(globalThis, "pluginManager");
    globalThis.runtimeCleanup = undefined;
    globalThis.recallDerivationWorker = undefined;
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
    expect(mocks.assertDatabaseRequirements).toHaveBeenCalledWith(
      expect.objectContaining({ execute: expect.any(Function) }),
    );
    expect(mocks.initRuntimeState).toHaveBeenCalledWith(
      expect.objectContaining({
        profile: mocks.fakeProfile,
        database: mocks.fakeDatabaseAssessment,
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
      mocks.serverLogger,
    );
    expect(mocks.createAppPluginLoader).toHaveBeenCalledWith(
      mocks.serverLogger,
    );
    expect(mocks.fakeApp.all).not.toHaveBeenCalled();
    expect(mocks.fakeDrizzleDB.migrate).not.toHaveBeenCalled();
    expect(mocks.calls).toEqual([
      "bootstrap",
      "recall-derivation-worker",
      "graph-runtime",
      "recover-tasks",
      "domain-handlers",
      "vectorization-consumer",
      "message-gateway",
    ]);
    expect(mocks.initAllVectorStorage).not.toHaveBeenCalled();
    expect(mocks.registerVectorizationConsumer).toHaveBeenCalledWith(
      mocks.fakeBackends.vectorizationQueue,
    );
    expect(mocks.startRecallDerivationWorker).toHaveBeenCalledWith({
      db: mocks.fakeDrizzleClient,
      pluginManager: mocks.fakePluginManager,
      onStateCommitted: mocks.recallDerivationTaskProjectionObserver,
    });
    expect(
      mocks.createRecallDerivationTaskProjectionObserver,
    ).toHaveBeenCalledWith({
      db: mocks.fakeDrizzleClient,
    });
    expect(mocks.getCurrentRedisHandle).toHaveBeenCalledOnce();
    expect(globalThis.app).toBe(mocks.fakeApp);
    expect(globalThis.redis).toBeUndefined();
    expect(globalThis.pluginManager).toBe(mocks.fakePluginManager);
    expect(globalThis.runtimeCleanup).toBe(mocks.fakeCleanupHandle);
    expect(globalThis.recallDerivationWorker).toBe(
      mocks.fakeRecallDerivationWorker,
    );
    expect(mocks.configureReadinessReporter).toHaveBeenCalledTimes(2);
    expect(globalThis.inited).toBe(true);
    expect(exitSpy).not.toHaveBeenCalled();

    exitSpy.mockRestore();
  });

  it("never runs migrations when a legacy migration environment variable is set", async () => {
    const previous = process.env.DRIZZLE_MIGRATE;
    process.env.DRIZZLE_MIGRATE = "true";

    await initializeApp();

    expect(mocks.fakeDrizzleDB.migrate).not.toHaveBeenCalled();
    if (previous === undefined) delete process.env.DRIZZLE_MIGRATE;
    else process.env.DRIZZLE_MIGRATE = previous;
  });

  it("coalesces concurrent startup callers into one application bootstrap", async () => {
    await Promise.all([initializeApp(), initializeApp()]);

    expect(mocks.getDbHandle).toHaveBeenCalledOnce();
    expect(mocks.createRuntimeBackends).toHaveBeenCalledOnce();
  });

  it("stops an existing worker before replacing it during re-initialization", async () => {
    const previousStop = vi.fn().mockImplementation(async () => {
      mocks.calls.push("previous-worker-stop");
    });
    globalThis.recallDerivationWorker = { stop: previousStop };

    await initializeApp();

    expect(previousStop).toHaveBeenCalledOnce();
    expect(mocks.calls).toEqual(
      expect.arrayContaining([
        "bootstrap",
        "previous-worker-stop",
        "recall-derivation-worker",
      ]),
    );
    expect(mocks.calls.indexOf("previous-worker-stop")).toBeLessThan(
      mocks.calls.indexOf("recall-derivation-worker"),
    );
    expect(globalThis.recallDerivationWorker).toBe(
      mocks.fakeRecallDerivationWorker,
    );
  });

  it("stops the replacement worker when re-initialization later fails", async () => {
    const previousStop = vi.fn().mockResolvedValue(undefined);
    globalThis.recallDerivationWorker = { stop: previousStop };
    mocks.ensureTaskRecovery.mockRejectedValueOnce(
      new Error("db recovery failed"),
    );

    await expect(initializeApp()).resolves.toBeUndefined();

    expect(previousStop).toHaveBeenCalledOnce();
    expect(mocks.stopRecallDerivationWorker).toHaveBeenCalledOnce();
    expect(globalThis.recallDerivationWorker).toBeUndefined();
  });

  it("keeps HTTP liveness available and reports bootstrap failure when run recovery fails", async () => {
    const exitSpy = vi.spyOn(process, "exit");
    mocks.ensureTaskRecovery.mockRejectedValueOnce(
      new Error("db recovery failed"),
    );

    await expect(initializeApp()).resolves.toBeUndefined();

    expect(exitSpy).not.toHaveBeenCalled();
    expect(globalThis.inited).not.toBe(true);
    expect(mocks.registerVectorizationConsumer).not.toHaveBeenCalled();
    expect(mocks.registerDomainEventHandlers).not.toHaveBeenCalled();
    expect(mocks.createDefaultGraphRuntime).toHaveBeenCalledOnce();
    expect(mocks.messageGatewayStart).not.toHaveBeenCalled();
    expect(mocks.disposeGraphRuntime).toHaveBeenCalledOnce();
    expect(mocks.stopRecallDerivationWorker).toHaveBeenCalledOnce();
    expect(globalThis.recallDerivationWorker).toBeUndefined();
    expect(mocks.fakeCleanupHandle.stop).toHaveBeenCalledOnce();
    expect(globalThis.runtimeCleanup).toBeUndefined();

    exitSpy.mockRestore();
  });

  it("disposes an existing graph runtime when task recovery fails", async () => {
    mocks.getGlobalGraphRuntimeOrNull.mockReturnValue(mocks.fakeGraphRuntime);
    mocks.ensureTaskRecovery.mockRejectedValueOnce(
      new Error("existing runtime recovery failed"),
    );

    await expect(initializeApp()).resolves.toBeUndefined();

    expect(mocks.createDefaultGraphRuntime).not.toHaveBeenCalled();
    expect(mocks.disposeGraphRuntime).toHaveBeenCalledOnce();
    expect(mocks.registerVectorizationConsumer).not.toHaveBeenCalled();
    expect(mocks.registerDomainEventHandlers).not.toHaveBeenCalled();
    expect(mocks.messageGatewayStart).not.toHaveBeenCalled();
    expect(mocks.fakeCleanupHandle.stop).toHaveBeenCalledOnce();
  });

  it("keeps HTTP liveness available and reports bootstrap failure when queue recovery fails", async () => {
    const exitSpy = vi.spyOn(process, "exit");
    mocks.registerVectorizationConsumer.mockRejectedValueOnce(
      new Error("redis recovery failed"),
    );

    await expect(initializeApp()).resolves.toBeUndefined();

    expect(exitSpy).not.toHaveBeenCalled();
    expect(globalThis.inited).not.toBe(true);
    expect(mocks.createDefaultGraphRuntime).toHaveBeenCalledOnce();
    expect(mocks.messageGatewayStart).not.toHaveBeenCalled();
    expect(mocks.disposeGraphRuntime).toHaveBeenCalledOnce();
    expect(mocks.fakeCleanupHandle.stop).toHaveBeenCalledOnce();

    exitSpy.mockRestore();
  });
});
