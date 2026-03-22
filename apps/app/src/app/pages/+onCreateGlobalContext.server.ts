import type { GlobalContextServer } from "vike/types";

import app from "@cat/app-api/app";
import { ensureDB, ensureRootUser } from "@cat/db";
import {
  executeQuery,
  getSetting,
  getDbHandle,
  getRedisHandle,
  type DrizzleClient,
} from "@cat/domain";
import { registerDomainEventHandlers } from "@cat/operations";
import { PluginManager } from "@cat/plugin-core";
import {
  initAllVectorStorage,
  serverLogger as logger,
} from "@cat/server-shared";
import { assertPromise } from "@cat/shared/utils";
import { access } from "fs/promises";
import { join, resolve } from "path";

const getStringSetting = async (
  drizzle: DrizzleClient,
  key: string,
  fallback: string,
): Promise<string> => {
  const value = await executeQuery({ db: drizzle }, getSetting, { key });
  return typeof value === "string" ? value : fallback;
};

export const onCreateGlobalContext = async (ctx: GlobalContextServer) => {
  try {
    globalThis.app ??= app;

    const drizzleDB = await getDbHandle();
    await drizzleDB.ping();

    if (import.meta.env.PROD) {
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

    const redis = await getRedisHandle();
    await redis.ping();

    const pluginManager = PluginManager.get("GLOBAL", "");

    await pluginManager.getDiscovery().syncDefinitions(drizzleDB.client);

    // 注册一次 catch-all 中间件代理，路由解析委托给 PluginRouteRegistry
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
    registerDomainEventHandlers();

    ctx.drizzleDB = drizzleDB;
    ctx.redis = redis;
    ctx.pluginManager = pluginManager;

    ctx.name = await getStringSetting(drizzleDB.client, "server.name", "CAT");
    ctx.baseURL = await getStringSetting(
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
