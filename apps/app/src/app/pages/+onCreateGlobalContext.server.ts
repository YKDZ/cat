import type { VectorizationTask } from "@cat/operations";
import type { GlobalContextServer } from "vike/types";

import { seedTranslatorAgent } from "@cat/agent";
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
import { assertPromise } from "@cat/shared/utils";
import { createDefaultGraphRuntime } from "@cat/workflow";
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

    // 全局初始化 Redis-backed 缓存/会话存储（SSR 与 API 共享）
    initCacheStore(new RedisCacheStore(redis.redis));
    initSessionStore(new RedisSessionStore(redis.redis));

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
    registerDomainEventHandlers(drizzleDB.client, { pluginManager });

    // 初始化向量化任务队列并注册消费者
    const vectorizationQueue = new RedisTaskQueue<VectorizationTask>(
      redis.redis,
      "vectorization",
    );
    setVectorizationQueue(vectorizationQueue);
    await registerVectorizationConsumer(vectorizationQueue);

    // 初始化消息网关（站内信 + 邮件分发）
    const messageGateway = new MessageGateway({
      db: drizzleDB.client,
      getEmailProvider: () => {
        const services = pluginManager.getServices("EMAIL_PROVIDER");
        return services[0]?.service;
      },
    });
    messageGateway.start();
    globalThis.messageGateway = messageGateway;

    // 初始化 Agent Graph Runtime（全局单例，供 runGraph 等 API 使用）
    createDefaultGraphRuntime(drizzleDB.client, pluginManager);

    // 初始化权限引擎
    const cacheStore = getCacheStore();
    initPermissionEngine({
      db: drizzleDB.client,
      cache: cacheStore,
      auditEnabled: true,
    });

    // 播种系统角色（幂等）
    await seedSystemRoles(drizzleDB.client);

    // 播种内置翻译助手 Agent（幂等）
    await seedTranslatorAgent(drizzleDB.client);

    // 回填超级管理员：若 PermissionTuple 中尚无任何超级管理员记录（例如权限系统上线前已注册的用户），
    // 则将最早注册的用户自动提升为超级管理员。此调用内部幂等（通过 system:first_user_registered setting 去重）。
    const firstUser = await executeQuery(
      { db: drizzleDB.client },
      getFirstRegisteredUser,
      {},
    );
    if (firstUser !== null) {
      await grantFirstUserSuperadmin(drizzleDB.client, firstUser.id);
    }

    // 注册审计日志处理器
    registerAuditHandler(drizzleDB.client);

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
    process.exitCode = 1;
  }
};
