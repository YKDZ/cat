import {
  configureReadinessReporter,
  createReadinessReporter,
  ReadinessProbeFailure,
} from "@cat/app-api/app";
import app from "@cat/app-api/app";
import {
  executeQuery,
  getSetting,
  getDbHandle,
  getCurrentRedisHandle,
  getCacheStore,
  getSessionStore,
  getRuntimeState,
  assertDatabaseRequirements,
  assessDatabaseRequirements,
  initRuntimeState,
  resolveRuntimeProfile,
  type DrizzleClient,
  initCacheStore,
  initSessionStore,
} from "@cat/domain";
import { MessageGateway } from "@cat/message";
import {
  executeLanguageAnalysisReadinessAssessment,
  createRecallDerivationTaskProjectionObserver,
  registerDomainEventHandlers,
  registerVectorizationConsumer,
  startRecallDerivationWorker,
  type RecallDerivationWorker,
} from "@cat/operations";
import { initPermissionEngine, registerAuditHandler } from "@cat/permissions";
import { PluginManager } from "@cat/plugin-core";
import {
  serverLogger as logger,
  setVectorizationQueue,
} from "@cat/server-shared";
import { getDefaultRegistries, wireEntityStateFetchers } from "@cat/vcs";
import {
  createDefaultGraphRuntime,
  type DefaultGraphRuntime,
  getGlobalGraphRuntimeOrNull,
} from "@cat/workflow";

import { bootstrapApplicationData } from "./application-data-bootstrap.ts";
import { createAppPluginLoader } from "./default-plugins/catalog.ts";
import { createApplicationReadinessReporter } from "./readiness.ts";
import { createRuntimeBackends } from "./runtime-backends.ts";
import {
  getRuntimeCapabilities,
  hasRuntimeCapabilities,
  publishRuntimeCapabilities,
} from "./runtime-capabilities.ts";
import {
  startPostgresRuntimeCleanup,
  type RuntimeCleanupHandle,
} from "./runtime-cleanup.ts";

const getStringSetting = async (
  drizzle: DrizzleClient,
  key: string,
  fallback: string,
): Promise<string> => {
  const value = await executeQuery({ db: drizzle }, getSetting, { key });
  return typeof value === "string" ? value : fallback;
};

const awaitAbortableQuery = async <T>(
  query: Promise<T>,
  signal: AbortSignal | undefined,
): Promise<T> => {
  if (signal === undefined) return await query;

  let removeAbortListener = (): void => {};
  const aborted = new Promise<never>((_, reject) => {
    const abort = (): void => reject(signal.reason);
    if (signal.aborted) {
      abort();
      return;
    }
    signal.addEventListener("abort", abort, { once: true });
    removeAbortListener = (): void =>
      signal.removeEventListener("abort", abort);
  });

  try {
    return await Promise.race([query, aborted]);
  } finally {
    removeAbortListener();
    // node-postgres has no AbortSignal query API; query_timeout bounds this query.
    void query.catch(() => {});
  }
};

const initializeAppOnce = async (): Promise<void> => {
  const profile = resolveRuntimeProfile();
  let graphRuntime: DefaultGraphRuntime | null = null;
  let messageGateway: MessageGateway | null = null;
  let recallDerivationWorker: RecallDerivationWorker | null = null;
  let runtimeCleanup: RuntimeCleanupHandle | null = null;
  configureReadinessReporter(
    createReadinessReporter({
      profile: profile.name,
      probes: [
        {
          cost: "cheap",
          id: "bootstrap",
          required: true,
          run: async (): Promise<void> => {
            if (!globalThis.inited) {
              throw new ReadinessProbeFailure("BOOTSTRAP_PENDING");
            }
          },
        },
      ],
    }),
  );
  try {
    globalThis.app ??= app;

    const drizzleDB = await getDbHandle();
    await drizzleDB.ping();

    const requirementDb = {
      execute: async (
        statement: string,
        options: { signal?: AbortSignal; timeoutMs?: number } = {},
      ) => {
        options.signal?.throwIfAborted();
        const query = {
          text: statement,
          ...(options.timeoutMs === undefined
            ? {}
            : { query_timeout: options.timeoutMs }),
        };
        const result = await awaitAbortableQuery(
          drizzleDB.client.$client.query(query),
          options.signal,
        );
        options.signal?.throwIfAborted();
        return { rows: result.rows };
      },
    };
    const database = await assertDatabaseRequirements(requirementDb);
    initRuntimeState({
      profile,
      database,
      initializedAt: new Date().toISOString(),
    });

    const backends = await createRuntimeBackends(profile, drizzleDB.client);
    const existingRedis = getCurrentRedisHandle();
    if (!backends.redis && existingRedis) {
      existingRedis.disconnect();
    }
    Reflect.set(globalThis, "__REDIS__", backends.redis);

    initCacheStore(backends.cacheStore);
    initSessionStore(backends.sessionStore);
    setVectorizationQueue(backends.vectorizationQueue);
    globalThis.runtimeCleanup?.stop();
    runtimeCleanup = startPostgresRuntimeCleanup([
      backends.cacheStore,
      backends.sessionStore,
    ]);
    globalThis.runtimeCleanup = runtimeCleanup;

    // Clear stale PluginManager instances before re-initialization.
    // In Vite dev mode, HMR re-evaluates +server.ts and calls initializeApp()
    // multiple times. Each call creates a fresh PluginLoader instance, which
    // would otherwise cause PluginManager.get() to throw because the existing
    // GLOBAL instance was created with a different (previous) loader reference.
    PluginManager.clear();
    const pluginLoader = createAppPluginLoader(logger);
    const pluginManager = PluginManager.get("GLOBAL", "", pluginLoader, logger);

    await bootstrapApplicationData({ database: drizzleDB, pluginManager });

    const previousRecallDerivationWorker = globalThis.recallDerivationWorker;
    if (previousRecallDerivationWorker) {
      globalThis.recallDerivationWorker = undefined;
      await previousRecallDerivationWorker.stop();
    }
    recallDerivationWorker = await startRecallDerivationWorker({
      db: drizzleDB.client,
      pluginManager,
      onStateCommitted: createRecallDerivationTaskProjectionObserver({
        db: drizzleDB.client,
      }),
    });
    globalThis.recallDerivationWorker = recallDerivationWorker;

    graphRuntime =
      getGlobalGraphRuntimeOrNull() ??
      createDefaultGraphRuntime(drizzleDB.client, pluginManager);
    await graphRuntime.ensureTaskRecovery();

    initPermissionEngine({
      db: drizzleDB.client,
      cache: backends.cacheStore,
      auditEnabled: true,
    });

    registerAuditHandler(drizzleDB.client);

    const { appMethodRegistry } = getDefaultRegistries();
    wireEntityStateFetchers(appMethodRegistry, drizzleDB.client);

    // Store resources in globalThis for Vike's onCreateGlobalContext to consume
    globalThis.drizzleDB = drizzleDB;
    globalThis.redis = backends.redis;
    globalThis.pluginManager = pluginManager;
    globalThis.serverName = await getStringSetting(
      drizzleDB.client,
      "server.name",
      "CAT",
    );
    globalThis.serverBaseURL = await getStringSetting(
      drizzleDB.client,
      "server.url",
      "http://localhost:3000/",
    );
    configureReadinessReporter(
      createApplicationReadinessReporter({
        backends,
        database: drizzleDB,
        getRuntimeState,
        profile,
        redis: backends.redis,
        assessDatabaseRequirements: async (signal) =>
          await assessDatabaseRequirements(requirementDb, { signal }),
        assessLanguageAnalysis: async (signal) =>
          await executeLanguageAnalysisReadinessAssessment({
            db: drizzleDB.client,
            pluginManager,
            signal,
            traceId: "readiness-language-analysis",
          }),
        storageServices: () =>
          pluginManager
            .getServices("STORAGE_PROVIDER")
            .map(({ service }) => service),
      }),
    );

    registerDomainEventHandlers(drizzleDB.client, { pluginManager });
    await registerVectorizationConsumer(backends.vectorizationQueue);

    messageGateway = new MessageGateway({
      db: drizzleDB.client,
      getEmailProvider: () => {
        const services = pluginManager.getServices("EMAIL_PROVIDER");
        return services[0]?.service;
      },
    });
    messageGateway.start();
    globalThis.messageGateway = messageGateway;

    publishRuntimeCapabilities({
      baseURL: globalThis.serverBaseURL,
      cacheStore: getCacheStore(),
      drizzleDB,
      name: globalThis.serverName,
      pluginManager,
      redis: backends.redis,
      sessionStore: getSessionStore(),
    });
    globalThis.inited = true;
  } catch (err) {
    logger
      .child({ component: "server" })
      .error("Failed to initialize server. Readiness will remain failed.", {
        error: err,
      });

    const cleanupResults = await Promise.allSettled([
      Promise.resolve().then(() => messageGateway?.stop()),
      graphRuntime?.dispose() ?? Promise.resolve(),
      Promise.resolve().then(async () => {
        if (globalThis.recallDerivationWorker === recallDerivationWorker) {
          globalThis.recallDerivationWorker = undefined;
        }
        await recallDerivationWorker?.stop();
      }),
      Promise.resolve().then(() => runtimeCleanup?.stop()),
    ]);
    for (const result of cleanupResults) {
      if (result.status === "fulfilled") continue;
      logger
        .child({ component: "server" })
        .error("Failed to clean up incomplete server initialization.", {
          error: result.reason,
        });
    }
    if (globalThis.messageGateway === messageGateway) {
      globalThis.messageGateway = undefined;
    }
    if (globalThis.runtimeCleanup === runtimeCleanup) {
      globalThis.runtimeCleanup = undefined;
    }

    configureReadinessReporter(
      createReadinessReporter({
        profile: profile.name,
        probes: [
          {
            cost: "cheap",
            id: "bootstrap",
            required: true,
            run: async (): Promise<void> => {
              throw new ReadinessProbeFailure("BOOTSTRAP_FAILED");
            },
          },
        ],
      }),
    );
  }
};

const initializationPromiseKey = "__CAT_INITIALIZATION_PROMISE__";

const isPromiseLike = (value: unknown): value is PromiseLike<unknown> =>
  typeof value === "object" &&
  value !== null &&
  typeof Reflect.get(value, "then") === "function";

/**
 * Vite may evaluate the server entry more than once while optimizing modules.
 * Keep initialization single-flight across those module instances so a fresh
 * database cannot observe concurrent bootstrap writes.
 */
export const initializeApp = async (): Promise<void> => {
  if (hasRuntimeCapabilities()) {
    getRuntimeCapabilities();
    return;
  }
  const existing = Reflect.get(process, initializationPromiseKey);
  if (isPromiseLike(existing)) {
    await existing;
    return;
  }
  const initialization = initializeAppOnce();
  Reflect.set(process, initializationPromiseKey, initialization);
  await initialization;
};
