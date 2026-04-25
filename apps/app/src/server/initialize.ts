import type { VectorizationTask } from "@cat/operations";

import { registerBuiltinAgents } from "@cat/agent";
import app from "@cat/app-api/app";
import { ensureDB, ensureRootUser } from "@cat/db";
import {
  executeQuery,
  getFirstRegisteredUser,
  getSetting,
  getDbHandle,
  getRedisHandle,
  type DrizzleClient,
  getCacheStore,
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
  initAllVectorStorage,
  RedisCacheStore,
  RedisSessionStore,
  RedisTaskQueue,
  serverLogger as logger,
  setVectorizationQueue,
} from "@cat/server-shared";
import { assertPromise } from "@cat/shared";
import { getDefaultRegistries, wireEntityStateFetchers } from "@cat/vcs";
import { createDefaultGraphRuntime } from "@cat/workflow";
import { access } from "fs/promises";
import { join, resolve } from "path";

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

    if (process.env.NODE_ENV === "production") {
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
    await assertSearchRuntimeHealth(drizzleDB.client);

    const redis = await getRedisHandle();
    await redis.ping();

    initCacheStore(new RedisCacheStore(redis.redis));
    initSessionStore(new RedisSessionStore(redis.redis));

    const pluginManager = PluginManager.get("GLOBAL", "");

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

    await drizzleDB.client.transaction(async (tx) => {
      await PluginManager.installDefaults(
        tx,
        pluginManager,
        resolve(process.cwd(), "default-plugins.json"),
      );

      await pluginManager.restore(tx);

      await ensureRootUser(tx);
    });

    await initAllVectorStorage(pluginManager);
    registerDomainEventHandlers(drizzleDB.client, { pluginManager });

    const vectorizationQueue = new RedisTaskQueue<VectorizationTask>(
      redis.redis,
      "vectorization",
    );
    setVectorizationQueue(vectorizationQueue);
    await registerVectorizationConsumer(vectorizationQueue);

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

    const cacheStore = getCacheStore();
    initPermissionEngine({
      db: drizzleDB.client,
      cache: cacheStore,
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
    globalThis.redis = redis;
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
