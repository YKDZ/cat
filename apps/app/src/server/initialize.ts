import { registerBuiltinAgents } from "@cat/agent";
import app from "@cat/app-api/app";
import { ensureDB, ensureRootUser } from "@cat/db";
import {
  executeCommand,
  executeQuery,
  getFirstRegisteredUser,
  getSetting,
  getDbHandle,
  getCurrentRedisHandle,
  initRuntimeState,
  recoverCrashedAgentRuns,
  resolveRuntimeProfile,
  type DrizzleClient,
  initCacheStore,
  initSessionStore,
} from "@cat/domain";
import { MessageGateway } from "@cat/message";
import {
  registerDomainEventHandlers,
  registerVectorizationConsumer,
} from "@cat/operations";
import {
  grantFirstUserSuperadmin,
  initPermissionEngine,
  registerAuditHandler,
  seedSystemRoles,
} from "@cat/permissions";
import { PluginManager } from "@cat/plugin-core";
import {
  serverLogger as logger,
  setVectorizationQueue,
} from "@cat/server-shared";
import { assertPromise } from "@cat/shared";
import { getDefaultRegistries, wireEntityStateFetchers } from "@cat/vcs";
import {
  createDefaultGraphRuntime,
  getGlobalGraphRuntimeOrNull,
} from "@cat/workflow";
import { access } from "fs/promises";
import { join } from "path";

import {
  createAppPluginLoader,
  getDefaultPluginIds,
} from "./default-plugins/catalog";
import { createRuntimeBackends } from "./runtime-backends";
import { startPostgresRuntimeCleanup } from "./runtime-cleanup";
import { assertSearchRuntimeHealth } from "./search-runtime-health";

const getStringSetting = async (
  drizzle: DrizzleClient,
  key: string,
  fallback: string,
): Promise<string> => {
  const value = await executeQuery({ db: drizzle }, getSetting, { key });
  return typeof value === "string" ? value : fallback;
};

export const initializeApp = async (): Promise<void> => {
  try {
    globalThis.app ??= app;

    const drizzleDB = await getDbHandle();
    await drizzleDB.ping();

    if (process.env.DRIZZLE_MIGRATE === "true") {
      const migrations = join(process.cwd(), "drizzle");
      await assertPromise(
        async () => access(migrations),
        "Does not found drizzle migration folder.",
      );

      logger.withSituation("SERVER").info("Start to migrate database...");

      const failure = await drizzleDB.migrate(migrations);
      if (failure) {
        throw new Error(
          `Database migration failed with exit code: ${failure.exitCode}`,
        );
      }

      logger.withSituation("SERVER").info("Successfully migrated database!");
    }

    await ensureDB(drizzleDB);
    const profile = resolveRuntimeProfile();
    const database = await assertSearchRuntimeHealth(drizzleDB.client, profile);
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
    globalThis.runtimeCleanup = startPostgresRuntimeCleanup([
      backends.cacheStore,
      backends.sessionStore,
    ]);

    // Clear stale PluginManager instances before re-initialization.
    // In Vite dev mode, HMR re-evaluates +server.ts and calls initializeApp()
    // multiple times. Each call creates a fresh PluginLoader instance, which
    // would otherwise cause PluginManager.get() to throw because the existing
    // GLOBAL instance was created with a different (previous) loader reference.
    PluginManager.clear();
    const pluginLoader = createAppPluginLoader();
    const pluginManager = PluginManager.get("GLOBAL", "", pluginLoader);

    const routeRegistry = pluginManager.getRouteRegistry();
    globalThis.app.all(
      "/_plugin/:scopeType/:scopeId/:pluginId/*",
      async (c) => {
        const { pluginId } = c.req.param();
        const pluginApp = routeRegistry.resolve(pluginId);
        if (!pluginApp) return c.notFound();
        return pluginApp.fetch(c.req.raw);
      },
    );

    await pluginManager.getDiscovery().syncDefinitions(drizzleDB.client);
    await PluginManager.installDefaults(
      drizzleDB.client,
      pluginManager,
      getDefaultPluginIds(),
    );

    // restore() 必须在事务外用 pool client 调用，确保 capabilities 持有的
    // DB 句柄是长期有效的 pool 连接，而非已提交/关闭的事务句柄。
    await pluginManager.restore(drizzleDB.client);

    // ensureRootUser 依赖插件服务已被 restore() 写入 DB（PASSWORD 服务），
    // 因此必须在 restore() 之后的独立事务中调用。
    await drizzleDB.client.transaction(async (tx) => {
      await ensureRootUser(tx);
    });

    registerDomainEventHandlers(drizzleDB.client, { pluginManager });

    const existingRuntime = getGlobalGraphRuntimeOrNull();
    const activeRunIds = existingRuntime?.scheduler.getActiveRunIds() ?? [];
    const crashRecovery = await executeCommand(
      { db: drizzleDB.client },
      recoverCrashedAgentRuns,
      { activeRunIds },
    );
    if (crashRecovery.recoveredRunIds.length > 0) {
      logger
        .withSituation("SERVER")
        .warn(
          { recoveredRunIds: crashRecovery.recoveredRunIds },
          "Recovered crashed workflow runs",
        );
    }

    await registerVectorizationConsumer(backends.vectorizationQueue);

    const messageGateway = new MessageGateway({
      db: drizzleDB.client,
      getEmailProvider: () => {
        const services = pluginManager.getServices("EMAIL_PROVIDER");
        return services[0]?.service;
      },
    });
    messageGateway.start();
    globalThis.messageGateway = messageGateway;

    createDefaultGraphRuntime(drizzleDB.client, pluginManager);

    initPermissionEngine({
      db: drizzleDB.client,
      cache: backends.cacheStore,
      auditEnabled: true,
    });

    await seedSystemRoles(drizzleDB.client);

    await registerBuiltinAgents(drizzleDB.client);

    const firstUser = await executeQuery(
      { db: drizzleDB.client },
      getFirstRegisteredUser,
      {},
    );
    if (firstUser !== null) {
      await grantFirstUserSuperadmin(drizzleDB.client, firstUser.id);
    }

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

    globalThis.inited = true;
  } catch (err) {
    logger
      .withSituation("SERVER")
      .error(err, "Failed to initialize server. Process will exit with code 1");
    process.exit(1);
  }
};
